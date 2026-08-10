import * as ImagePicker from 'expo-image-picker'
import { aiApi, ocrApi } from './endpoints'

/**
 * Captura de documentos con OCR — réplica EXACTA del client-data-step del portal.
 *
 * Flujo NORMAL (Nueva Venta):
 *  - Cédula  → `/clients/clientes/process-cedula` (primario) → si falla o viene
 *    incompleto (sin nombre/cédula) → fallback **Gemini** `/ai/ocr-process`.
 *  - Carnet  → `/clients/clientes/process-certificado` (primario) → si falla o
 *    viene incompleto (sin placa/marca/modelo) → fallback **Gemini** `/ai/ocr-process`.
 *  En QA el primario suele dar 403, así que en la práctica lee con Gemini.
 *
 * Flujo EXPRESS (Venta Rápida): la cédula usa `/ai/extract-cedula`.
 *
 * El OCR es autocompletado: si todo falla, el vendedor ingresa los datos a mano.
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

const OCR_TIMEOUT_MS = 30000

/** Normaliza una fecha del OCR (dd/mm/aaaa, dd-mm-aaaa o aaaa-mm-dd) a ISO yyyy-mm-dd. */
function fechaOcrAIso(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined
  const s = v.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return undefined
}

/** Corta la promesa a los `ms` (como el timeout(30000) del portal). */
function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('El servicio de OCR no respondió a tiempo.')), ms)),
  ])
}

interface ImagenElegida {
  uri: string
  base64?: string
  mimeType: string
}

async function elegir(fuente: FuenteImagen): Promise<ImagenElegida | null> {
  if (fuente === 'camara') {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) throw new Error('Permiso de cámara denegado.')
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) throw new Error('Permiso de galería denegado.')
  }
  // Pedimos base64 siempre: el fallback Gemini lo necesita.
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, base64: true, allowsEditing: false }
  const r = fuente === 'camara' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
  if (r.canceled || !r.assets?.[0]) return null
  const a = r.assets[0]
  return { uri: a.uri, base64: a.base64 ?? undefined, mimeType: a.mimeType ?? 'image/jpeg' }
}

function archivo(img: ImagenElegida, nombre: string): FormData {
  const form = new FormData()
  // React Native acepta { uri, name, type } como parte de archivo en FormData.
  form.append('file', { uri: img.uri, name: nombre, type: img.mimeType } as any)
  return form
}

function mapearCedula(d: any): DatosCedulaOCR {
  return {
    // El OCR usa campos SINGULARES: nombre / apellido / sexo.
    nombres: d.nombre ?? d.nombres,
    apellidos: d.apellido ?? d.apellidos,
    numeroDocumento: d.cedula ?? d.numeroDocumento ?? d.documento,
    fechaNacimiento: fechaOcrAIso(d.fechaNacimiento ?? d.fecha_nacimiento),
    genero: d.sexo ?? d.genero,
  }
}
const cedulaIncompleta = (d: any) => !d || !(d.nombre ?? d.nombres) || !(d.cedula ?? d.numeroDocumento)

function mapearCarnet(d: any): DatosCarnetOCR {
  const serialNiv = d.serialNiv ?? d.serial_niv ?? d.niv ?? d.serialCarroceria
  return {
    placa: d.placa,
    serialNiv,
    serialCarroceria: d.serialCarroceria ?? serialNiv,
    serialMotor: d.serialMotor ?? d.serial_motor,
    color: d.color,
    marca: d.marca,
    modelo: d.modelo,
    anio: d.anio ? String(d.anio) : undefined,
  }
}
const carnetIncompleto = (d: any) => !d || !d.placa || !d.marca || !d.modelo

/**
 * Captura la cédula y extrae los datos del tomador.
 * @param express usa el OCR del flujo Express (`/ai/extract-cedula`) en vez del primario.
 */
export async function ocrCedula(fuente: FuenteImagen, express = false): Promise<DatosCedulaOCR | null> {
  const img = await elegir(fuente)
  if (!img) return null

  if (express) {
    const form = archivo(img, 'cedula.jpg')
    form.append('user_id', 'guest')
    form.append('purpose', 'kyc_cedula')
    const r = await conTimeout(aiApi.extractCedula(form), OCR_TIMEOUT_MS)
    return mapearCedula(r?.data?.customer ?? r?.data ?? (r as any) ?? {})
  }

  // 1) Primario: process-cedula.
  let d: any = null
  try {
    const r = await conTimeout(ocrApi.processCedula(archivo(img, 'cedula.jpg')), OCR_TIMEOUT_MS)
    d = r?.data ?? {}
    if (cedulaIncompleta(d)) d = null
  } catch {
    d = null
  }
  // 2) Fallback Gemini.
  if (!d) {
    if (!img.base64) throw new Error('No se pudo leer la imagen.')
    const r = await conTimeout(aiApi.ocrProcess(img.base64, img.mimeType, 'cedula'), OCR_TIMEOUT_MS)
    d = r?.data ?? {}
  }
  return mapearCedula(d)
}

/** Captura el carnet de circulación y extrae los datos del vehículo. */
export async function ocrCarnet(fuente: FuenteImagen): Promise<DatosCarnetOCR | null> {
  const img = await elegir(fuente)
  if (!img) return null

  // 1) Primario: process-certificado.
  let d: any = null
  try {
    const r = await conTimeout(ocrApi.processCertificado(archivo(img, 'carnet.jpg')), OCR_TIMEOUT_MS)
    d = r?.data ?? {}
    if (carnetIncompleto(d)) d = null
  } catch {
    d = null
  }
  // 2) Fallback Gemini.
  if (!d) {
    if (!img.base64) throw new Error('No se pudo leer la imagen.')
    const r = await conTimeout(aiApi.ocrProcess(img.base64, img.mimeType, 'certificado'), OCR_TIMEOUT_MS)
    d = r?.data ?? {}
  }
  return mapearCarnet(d)
}
