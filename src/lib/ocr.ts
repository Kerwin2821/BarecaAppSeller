import * as ImagePicker from 'expo-image-picker'
import { aiApi } from './endpoints'

/**
 * Captura de documentos con OCR (réplica del client-data-step del portal):
 * - Cédula → `/api/ai/extract-cedula` (multipart) → datos del tomador.
 * - Carnet de circulación → `/api/ai/ocr-process` (base64) → datos del vehículo.
 */

export interface DatosCedulaOCR {
  nombres?: string
  apellidos?: string
  numeroDocumento?: string
  fechaNacimiento?: string
  genero?: string
}

export interface DatosCarnetOCR {
  placa?: string
  serialNiv?: string
  serialCarroceria?: string
  serialMotor?: string
  color?: string
  marca?: string
  modelo?: string
  anio?: string
}

export type FuenteImagen = 'camara' | 'galeria'

/** Normaliza una fecha del OCR (dd/mm/aaaa, dd-mm-aaaa o aaaa-mm-dd) a ISO yyyy-mm-dd. */
function fechaOcrAIso(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined
  const s = v.trim()
  // Ya viene ISO
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // dd/mm/aaaa o dd-mm-aaaa
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return undefined
}

interface ImagenElegida {
  uri: string
  base64?: string
  mimeType: string
}

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Ejecuta la llamada al OCR y, si falla con un error transitorio del gateway
 * (502/503/504/timeout), reintenta una vez tras una breve pausa. El OCR (Gemini)
 * a veces tarda y el BFF corta con 502; el reintento suele resolverlo sin que el
 * vendedor tenga que volver a tomar la foto.
 */
async function conReintentoGateway<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const msg = String((e as any)?.message ?? e)
    const status = (e as any)?.status
    const transitorio = status === 502 || status === 503 || status === 504 || /50[234]|gateway|timeout|tiempo|Failed to fetch/i.test(msg)
    if (!transitorio) throw e
    await espera(1200)
    return await fn()
  }
}

async function elegir(fuente: FuenteImagen, conBase64: boolean): Promise<ImagenElegida | null> {
  if (fuente === 'camara') {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) throw new Error('Permiso de cámara denegado.')
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) throw new Error('Permiso de galería denegado.')
  }
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    base64: conBase64,
    allowsEditing: false,
  }
  const r =
    fuente === 'camara'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts)
  if (r.canceled || !r.assets?.[0]) return null
  const a = r.assets[0]
  return { uri: a.uri, base64: a.base64 ?? undefined, mimeType: a.mimeType ?? 'image/jpeg' }
}

/** Captura la cédula y extrae los datos del tomador. */
export async function ocrCedula(fuente: FuenteImagen): Promise<DatosCedulaOCR | null> {
  const img = await elegir(fuente, false)
  if (!img) return null
  const form = new FormData()
  // React Native acepta { uri, name, type } como parte de archivo en FormData.
  form.append('file', { uri: img.uri, name: 'cedula.jpg', type: img.mimeType } as any)
  form.append('user_id', 'guest')
  form.append('purpose', 'kyc_cedula')
  const r = await conReintentoGateway(() => aiApi.extractCedula(form))
  // La respuesta puede venir plana o envuelta en data/customer.
  const d = r?.data?.customer ?? r?.data ?? (r as any) ?? {}
  return {
    // El OCR usa campos SINGULARES: nombre / apellido / sexo.
    nombres: d.nombre ?? d.nombres,
    apellidos: d.apellido ?? d.apellidos,
    numeroDocumento: d.cedula ?? d.numeroDocumento ?? d.documento,
    fechaNacimiento: fechaOcrAIso(d.fechaNacimiento ?? d.fecha_nacimiento),
    genero: d.sexo ?? d.genero,
  }
}

/** Captura el carnet de circulación y extrae los datos del vehículo. */
export async function ocrCarnet(fuente: FuenteImagen): Promise<DatosCarnetOCR | null> {
  const img = await elegir(fuente, true)
  if (!img) return null
  if (!img.base64) throw new Error('No se pudo leer la imagen.')
  const r = await conReintentoGateway(() => aiApi.ocrProcess(img.base64!, img.mimeType, 'certificado'))
  const d = r?.data ?? {}
  return {
    placa: d.placa,
    serialNiv: d.serialNiv ?? d.serial_niv ?? d.niv,
    serialCarroceria: d.serialCarroceria ?? d.serialNiv,
    serialMotor: d.serialMotor ?? d.serial_motor,
    color: d.color,
    marca: d.marca,
    modelo: d.modelo,
    anio: d.anio ? String(d.anio) : undefined,
  }
}
