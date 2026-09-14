import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import {
  atualcanceApi,
  paymentApi,
  walletApi,
  type AtaCatalogo,
  type AtaCotizacion,
  type AtaDatosPersona,
  type AtaDetalleContrato,
  type AtaDocumentoCargado,
  type AtaEnlacePago,
  type AtaFrecuencia,
  type AtaLineaCotizacion,
  type AtaOpcionFrecuencia,
  type AtaResultadoEmision,
  type Banco,
} from './endpoints'
import { mensajeDeError } from './api'
import { MONTO_REAL, traducirCodigoBanco } from './emisionPago'
import { elegirImagen, imagenComoArchivo, ocrCedula, type FuenteImagen, type ImagenElegida } from './ocr'
import { actorUuid } from './roles'
import { marcarVentaHoy } from './ventaLocal'
import type { CurrentUser } from './tipos'

/**
 * Asistente de venta de A TU ALCANCE (medicina prepagada, Latina Salud).
 *
 * Réplica del `AtaAlcanceWizardService` + `AtaAlcanceWizard` del portal web. La regla
 * de negocio NO se replica aquí: elegibilidad, recargo, rechazo y precio los decide el
 * backend al cotizar; este hook solo guarda lo capturado y muestra el resultado, para
 * que no haya dos verdades sobre quién entra y a qué precio.
 *
 * Tres pasos: solicitud (plan + personas + declaración de salud) → expediente
 * (recaudos) → resumen y cobro (emitir + cobrar la cuota 1). La cuota 1 se cobra
 * DESPUÉS de emitir: la emisión valida expediente y suscripción, y cobrar antes
 * dejaría clientes con el dinero descontado y sin contrato.
 */

export type AtaPaso = 'solicitud' | 'expediente' | 'resumen' | 'resultado'
export const ATA_PASOS: { id: AtaPaso; numero: number; label: string }[] = [
  { id: 'solicitud', numero: 1, label: 'Solicitud' },
  { id: 'expediente', numero: 2, label: 'Expediente' },
  { id: 'resumen', numero: 3, label: 'Resumen y cobro' },
]

/** Solo los parentescos que admite Latina (titular, cónyuge, hijo/a, padre/madre). */
export const ATA_PARENTESCOS = ['TITULAR', 'CONYUGE', 'HIJO', 'PADRE', 'MADRE'] as const
export const ETIQUETA_PARENTESCO: Record<string, string> = {
  TITULAR: 'Titular',
  CONYUGE: 'Cónyuge',
  HIJO: 'Hijo/a',
  PADRE: 'Padre',
  MADRE: 'Madre',
}
export const ESTADOS_CIVILES = ['SOLTERO', 'CASADO', 'DIVORCIADO', 'VIUDO', 'CONCUBINO'] as const

export type MetodoPrimeraCuota = 'DEBITO_INMEDIATO' | 'PAGO_MOVIL' | 'WALLET' | 'TRANSFERENCIA'
export type FaseCobro = 'datos' | 'otp' | 'esperando' | 'listo'
export type Pasarela = 'PLAZA' | 'R4'

/** Un integrante del grupo familiar mientras se arma la venta. */
export interface AtaIntegrante {
  clave: string
  parentesco: string
  persona: AtaDatosPersona
  maternidad: boolean
  /** Patologías marcadas (preguntas 1 y 2). */
  patologias: string[]
  alturaCm: number | null
  pesoKg: number | null
  /** Respuestas 3, 4 y 5: "NO", "SI", "SI: detalle" o "NO_APLICA". */
  respuestas: Record<string, string>
  aceptoDeclaracion: boolean
  firmaTipo: 'MANUSCRITA' | ''
  firmaUrl: string
  /** Contacto copiado del titular al emitir (Latina lo pide por afiliado). */
  contactoIgualTitular: boolean
}

export const TIPOS_DOC_EXPEDIENTE = [
  { tipo: 'CI_CONTRATANTE', etiqueta: 'Cédula del contratante', obligatorio: true },
  { tipo: 'CI_TITULAR', etiqueta: 'Cédula del titular', obligatorio: true },
  { tipo: 'RIF_CONTRATANTE', etiqueta: 'RIF del contratante', obligatorio: false },
  { tipo: 'RIF_TITULAR', etiqueta: 'RIF del titular', obligatorio: false },
]

const OTP_VIGENCIA_S = 180
const ID_CLIENTE_PLAZA = 'J303934870'

const hoyIso = () => new Date().toISOString().slice(0, 10)
const vacio = (v: string | null | undefined) => !v || !String(v).trim()
const soloDigitos = (v: string | undefined) => (v || '').replace(/\D/g, '')
const correoValido = (v?: string) => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

/**
 * Banco Plaza exige la cédula con su letra y 8 dígitos ("V9484527" → "V09484527");
 * R4 la quiere en dígitos pelados. Misma regla que `pasarela-bancaria.ts` de la web.
 */
export function cedulaParaPasarela(cedula: string, esPlaza: boolean, tipoDocumento = 'V'): string {
  const limpia = (cedula ?? '').toString().trim().toUpperCase()
  if (!limpia) return ''
  const conLetra = limpia.match(/^([VEJGP])[-\s]?(\d+)$/)
  const letra = conLetra ? conLetra[1] : (tipoDocumento || 'V').toUpperCase().charAt(0)
  const digitos = conLetra ? conLetra[2] : limpia.replace(/\D/g, '')
  if (!digitos) return ''
  return esPlaza ? letra + digitos.padStart(8, '0') : digitos
}
const esCodigoAprobado = (c?: string) => c === 'ACCP' || c === '0000'
const esCodigoPendiente = (c?: string) => c === 'AC00' || c === '0031'

export function nuevoIntegrante(parentesco: string): AtaIntegrante {
  return {
    clave: `${parentesco}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    parentesco,
    persona: { numeroDocumento: '', tipoDocumento: 'V' },
    maternidad: false,
    patologias: [],
    alturaCm: null,
    pesoKg: null,
    respuestas: {},
    aceptoDeclaracion: false,
    firmaTipo: '',
    firmaUrl: '',
    contactoIgualTitular: parentesco !== 'TITULAR',
  }
}

/** Actor cuya billetera se usa (kiosco, distribuidor u oficina). */
function actorDe(u: CurrentUser | null): { tipo: string; uuid: string } | null {
  if (!u) return null
  if (u.kioskoId) return { tipo: 'KIOSCO', uuid: u.kioskoId }
  if (u.distribuidorId) return { tipo: 'DISTRIBUIDOR', uuid: u.distribuidorId }
  if (u.oficinaRegionalId) return { tipo: 'OFICINA_REGIONAL', uuid: u.oficinaRegionalId }
  return null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useAtaWizard(user: CurrentUser | null) {
  // ── Estado general ──
  const [paso, setPaso] = useState<AtaPaso>('solicitud')
  const [catalogo, setCatalogo] = useState<AtaCatalogo | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Solicitud ──
  const [planId, setPlanId] = useState('')
  const [vigenciaDesde] = useState(hoyIso())
  const [modalidadCobro, setModalidadCobro] = useState<'AVISO_CLIENTE' | 'VENDEDOR_COBRA'>('AVISO_CLIENTE')
  const [frecuenciaPago, setFrecuenciaPago] = useState<AtaFrecuencia>('SEMANAL')
  const [contratante, setContratanteState] = useState<AtaDatosPersona>({ numeroDocumento: '', tipoDocumento: 'V' })
  const [contratanteEsTitular, setContratanteEsTitularState] = useState(false)
  const [integrantes, setIntegrantes] = useState<AtaIntegrante[]>([nuevoIntegrante('TITULAR')])
  const [documentos, setDocumentos] = useState<AtaDocumentoCargado[]>([])
  const [cotizacion, setCotizacion] = useState<AtaCotizacion | null>(null)
  const [observaciones, setObservaciones] = useState('')

  // ── Declaración y firma (una sola, del contratante; se replica a cada afiliado) ──
  const [declaracionAceptada, setDeclaracionAceptadaState] = useState(false)
  const [firmaUrl, setFirmaUrl] = useState<string | null>(null)
  const [firmaPng, setFirmaPng] = useState<string | null>(null)
  const [guardandoFirma, setGuardandoFirma] = useState(false)

  // ── OCR / subidas ──
  const [leyendoCedula, setLeyendoCedula] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState<Record<string, boolean>>({})

  // ── Emisión ──
  const [resultado, setResultado] = useState<AtaResultadoEmision | null>(null)
  const [detalle, setDetalle] = useState<AtaDetalleContrato | null>(null)

  // ── Cobro cuota 1 ──
  const [metodoPrimeraCuota, setMetodoPrimeraCuota] = useState<MetodoPrimeraCuota>('DEBITO_INMEDIATO')
  const [faseCobro, setFaseCobro] = useState<FaseCobro>('datos')
  const [enlaceCobro, setEnlaceCobro] = useState<AtaEnlacePago | null>(null)
  const [cobrando, setCobrando] = useState(false)
  const [primeraCobrada, setPrimeraCobrada] = useState<{ montoBs: number; tasa: number } | null>(null)
  const [pasarela, setPasarela] = useState<Pasarela>('PLAZA')
  const [banco, setBanco] = useState('')
  const [telefonoPago, setTelefonoPago] = useState('')
  const [cedulaPago, setCedulaPago] = useState('')
  const [otp, setOtp] = useState('')
  const [referenciaPago, setReferenciaPago] = useState('')
  const [fechaTransferencia, setFechaTransferencia] = useState('')
  const [otpRestante, setOtpRestante] = useState(0)
  const [bancos, setBancos] = useState<Banco[]>([])
  const [tasaBcv, setTasaBcv] = useState(0)
  const [walletSaldo, setWalletSaldo] = useState(0)
  const otpTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const vivo = useRef(true)
  useEffect(() => () => { vivo.current = false; if (otpTimer.current) clearInterval(otpTimer.current) }, [])

  // ── Derivados ──
  const plan = useMemo(() => catalogo?.planes.find((p) => p.id === planId) ?? null, [catalogo, planId])
  const titular = useMemo(() => integrantes.find((i) => i.parentesco === 'TITULAR') ?? null, [integrantes])
  const beneficiarios = useMemo(() => integrantes.filter((i) => i.parentesco !== 'TITULAR'), [integrantes])
  const lineasElegibles = useMemo(() => cotizacion?.lineas.filter((l) => l.elegible) ?? [], [cotizacion])
  const lineasRechazadas = useMemo(() => cotizacion?.lineas.filter((l) => !l.elegible) ?? [], [cotizacion])
  const titularRechazado = useMemo(() => lineasRechazadas.some((l) => l.parentesco === 'TITULAR'), [lineasRechazadas])
  const opcionFrecuencia = useMemo<AtaOpcionFrecuencia | null>(() => {
    if (!cotizacion) return null
    const elegida = (cotizacion.frecuencias || []).find((f) => f.codigo === frecuenciaPago)
    return elegida ?? { codigo: 'SEMANAL', etiqueta: 'Semanal', cobros: cotizacion.semanas, cuotaUsd: cotizacion.totalSemanalUsd }
  }, [cotizacion, frecuenciaPago])
  /** Línea de la cotización de un integrante (mismo orden en que se enviaron). */
  const lineaDe = useCallback(
    (i: AtaIntegrante): AtaLineaCotizacion | null => {
      const idx = integrantes.findIndex((x) => x.clave === i.clave)
      return idx >= 0 ? (cotizacion?.lineas[idx] ?? null) : null
    },
    [integrantes, cotizacion],
  )
  const excluyentes = useMemo(() => new Set((catalogo?.excluyentes ?? []).map((p) => p.patologia)), [catalogo])
  const noAsegurable = useCallback((i: AtaIntegrante) => i.patologias.some((p) => excluyentes.has(p)), [excluyentes])

  // ── Carga inicial ──
  useEffect(() => {
    let v = true
    setCargando(true)
    atualcanceApi
      .catalogo()
      .then((c) => {
        if (!v) return
        setCatalogo(c)
        if (c.planes.length) setPlanId((p) => p || c.planes[0].id)
      })
      .catch((e) => v && setError(mensajeDeError(e) || 'No se pudo cargar el catálogo del producto'))
      .finally(() => v && setCargando(false))
    atualcanceApi.tasaBcv().then((t) => v && setTasaBcv(t?.tasaBcv ?? 0)).catch(() => undefined)
    paymentApi.bancos().then((r) => v && setBancos(r?.data ?? [])).catch(() => undefined)
    const actor = actorDe(user)
    if (actor) {
      walletApi.miWallet(actor.tipo, actor.uuid).then((w: any) => v && setWalletSaldo(Number(w?.saldo ?? w?.data?.saldo ?? 0) || 0)).catch(() => undefined)
    }
    return () => { v = false }
  }, [user])

  // ── Integrantes ──
  const actualizarIntegrante = useCallback((clave: string, cambios: Partial<AtaIntegrante>) => {
    setIntegrantes((lista) => {
      // Los recaudos del beneficiario se archivan por su documento: si cambia, se re-etiquetan.
      const antes = lista.find((i) => i.clave === clave)?.persona.numeroDocumento
      const despues = cambios.persona?.numeroDocumento
      if (despues !== undefined && antes !== undefined && despues !== antes) {
        setDocumentos((docs) => docs.map((d) => (d.documentoAfiliado === antes ? { ...d, documentoAfiliado: despues } : d)))
      }
      return lista.map((i) => (i.clave === clave ? { ...i, ...cambios } : i))
    })
  }, [])
  const setPersona = useCallback(
    (i: AtaIntegrante, campo: keyof AtaDatosPersona, valor: string) =>
      actualizarIntegrante(i.clave, { persona: { ...i.persona, [campo]: valor } }),
    [actualizarIntegrante],
  )
  const agregarIntegrante = useCallback((parentesco: string) => setIntegrantes((l) => [...l, nuevoIntegrante(parentesco)]), [])
  const quitarIntegrante = useCallback((clave: string) => setIntegrantes((l) => l.filter((i) => i.clave !== clave)), [])

  const setContratante = useCallback((campo: keyof AtaDatosPersona, valor: string) => {
    setContratanteState((c) => ({ ...c, [campo]: valor }))
    // Si contratante = titular, lo que se escribe en uno vale para el otro.
    if (contratanteEsTitular && titular && ['nombres', 'apellidos', 'numeroDocumento', 'tipoDocumento', 'fechaNacimiento', 'sexo', 'telefono', 'correo', 'direccion', 'rif'].includes(campo)) {
      actualizarIntegrante(titular.clave, { persona: { ...titular.persona, [campo]: valor } })
    }
  }, [contratanteEsTitular, titular, actualizarIntegrante])

  /** Marcar "el contratante es el titular" copia los datos ya escritos al titular. */
  const setContratanteEsTitular = useCallback((esElMismo: boolean) => {
    setContratanteEsTitularState(esElMismo)
    if (esElMismo && titular) {
      actualizarIntegrante(titular.clave, { persona: { ...titular.persona, ...contratante } })
      // La cédula del contratante sirve para los dos.
      setDocumentos((docs) => {
        const ci = docs.find((d) => d.tipo === 'CI_CONTRATANTE')
        if (!ci || docs.some((d) => d.tipo === 'CI_TITULAR')) return docs
        return [...docs, { ...ci, tipo: 'CI_TITULAR' }]
      })
    }
  }, [titular, contratante, actualizarIntegrante])

  // ── Cuestionario ──
  const alternarPatologia = useCallback((i: AtaIntegrante, patologia: string) => {
    const marcadas = i.patologias.includes(patologia) ? i.patologias.filter((p) => p !== patologia) : [...i.patologias, patologia]
    actualizarIntegrante(i.clave, { patologias: marcadas })
  }, [actualizarIntegrante])
  const responder = useCallback((i: AtaIntegrante, numero: number, valor: string) =>
    actualizarIntegrante(i.clave, { respuestas: { ...i.respuestas, [String(numero)]: valor } }), [actualizarIntegrante])
  const respuestaSiNo = (i: AtaIntegrante, n: number): 'SI' | 'NO' | '' => {
    const v = (i.respuestas[String(n)] || '').trim().toUpperCase()
    return v.startsWith('SI') ? 'SI' : v.startsWith('NO') ? 'NO' : ''
  }
  const detalleSiNo = (i: AtaIntegrante, n: number) => {
    const v = (i.respuestas[String(n)] || '').trim()
    const sep = v.indexOf(':')
    return sep >= 0 ? v.slice(sep + 1).trim() : ''
  }
  const responderSiNo = (i: AtaIntegrante, n: number, valor: 'SI' | 'NO') => {
    const detalle = valor === 'SI' ? detalleSiNo(i, n) : ''
    responder(i, n, detalle ? `SI: ${detalle}` : valor)
  }
  const responderDetalle = (i: AtaIntegrante, n: number, detalle: string) => responder(i, n, detalle.trim() ? `SI: ${detalle}` : 'SI')

  const setDeclaracionAceptada = useCallback((acepto: boolean) => {
    setDeclaracionAceptadaState(acepto)
    setIntegrantes((l) => l.map((i) => ({ ...i, aceptoDeclaracion: acepto })))
  }, [])

  // ── Documentos ──
  const registrarDocumento = useCallback((doc: AtaDocumentoCargado) => {
    setDocumentos((l) => [...l.filter((d) => !(d.tipo === doc.tipo && d.documentoAfiliado === doc.documentoAfiliado)), doc])
  }, [])
  const quitarDocumento = useCallback((tipo: string, documentoAfiliado?: string) =>
    setDocumentos((l) => l.filter((d) => !(d.tipo === tipo && d.documentoAfiliado === documentoAfiliado))), [])
  const documentoDe = useCallback((tipo: string, documentoAfiliado?: string) =>
    documentos.find((d) => d.tipo === tipo && d.documentoAfiliado === documentoAfiliado), [documentos])
  const claveDoc = (tipo: string, documentoAfiliado?: string) => `${tipo}:${documentoAfiliado ?? ''}`

  /** Sube una imagen al expediente (S3 vía BFF) y la registra. */
  const subirDocumento = useCallback(async (tipo: string, img: ImagenElegida, documentoAfiliado?: string, nombre = 'recaudo.jpg') => {
    const k = claveDoc(tipo, documentoAfiliado)
    setSubiendo((s) => ({ ...s, [k]: true }))
    try {
      const r = await atualcanceApi.subirDocumento(tipo, imagenComoArchivo(img, nombre, 'archivo'))
      registrarDocumento({ tipo, urlS3: r.url, documentoAfiliado, nombreArchivo: r.nombreArchivo || nombre })
      return r.url
    } finally {
      setSubiendo((s) => ({ ...s, [k]: false }))
    }
  }, [registrarDocumento])

  /** Toma/elige la foto de un recaudo y la sube. */
  const cargarDocumento = useCallback(async (fuente: FuenteImagen, tipo: string, documentoAfiliado?: string) => {
    setError(null)
    try {
      const img = await elegirImagen(fuente)
      if (!img) return
      await subirDocumento(tipo, img, documentoAfiliado)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }, [subirDocumento])

  /**
   * Lee la cédula con OCR, rellena los datos de esa persona y deja la foto como recaudo.
   * Una sola foto para dos cosas. Lo leído se puede corregir a mano.
   */
  const leerCedula = useCallback(async (fuente: FuenteImagen, destino: 'CONTRATANTE' | 'TITULAR' | 'BENEFICIARIO', integrante?: AtaIntegrante) => {
    const quien = destino === 'BENEFICIARIO' ? integrante!.clave : destino
    setLeyendoCedula(quien)
    setError(null)
    try {
      const img = await elegirImagen(fuente)
      if (!img) return
      let datos: Awaited<ReturnType<typeof ocrCedula>> = null
      try {
        datos = await ocrCedula(fuente, false, img)
      } catch {
        setError('No se pudo leer la cédula; completa los datos a mano. La imagen igual se guardó.')
      }
      let documentoAfiliado = integrante?.persona.numeroDocumento
      if (datos) {
        const campos: Partial<AtaDatosPersona> = {}
        if (datos.nombres) campos.nombres = datos.nombres
        if (datos.apellidos) campos.apellidos = datos.apellidos
        if (datos.numeroDocumento) campos.numeroDocumento = String(datos.numeroDocumento).replace(/^[VEJPGvejpg][-\s]?/, '').replace(/\D/g, '')
        if (datos.fechaNacimiento) campos.fechaNacimiento = datos.fechaNacimiento
        if (datos.genero) campos.sexo = datos.genero.toUpperCase().charAt(0)
        if (destino === 'CONTRATANTE') {
          setContratanteState((c) => ({ ...c, ...campos }))
          if (contratanteEsTitular && titular) actualizarIntegrante(titular.clave, { persona: { ...titular.persona, ...campos } })
        } else {
          const objetivo = destino === 'TITULAR' ? titular : integrante
          if (objetivo) actualizarIntegrante(objetivo.clave, { persona: { ...objetivo.persona, ...campos } })
          if (destino === 'BENEFICIARIO' && campos.numeroDocumento) documentoAfiliado = campos.numeroDocumento
        }
      }
      const tipo = destino === 'BENEFICIARIO' ? 'CI_AFILIADO' : `CI_${destino}`
      const url = await subirDocumento(tipo, img, destino === 'BENEFICIARIO' ? documentoAfiliado || undefined : undefined, 'cedula.jpg')
      if (destino === 'CONTRATANTE' && contratanteEsTitular) registrarDocumento({ tipo: 'CI_TITULAR', urlS3: url, nombreArchivo: 'cedula.jpg' })
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setLeyendoCedula(null)
    }
  }, [contratanteEsTitular, titular, actualizarIntegrante, subirDocumento, registrarDocumento])

  /** Guarda la firma (PNG base64) en S3 y deja su URL en cada afiliado. */
  const guardarFirma = useCallback(async (dataUri: string) => {
    setFirmaPng(dataUri)
    setGuardandoFirma(true)
    setError(null)
    try {
      const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri
      const ruta = `${FileSystem.cacheDirectory}firma-${Date.now()}.png`
      await FileSystem.writeAsStringAsync(ruta, base64, { encoding: FileSystem.EncodingType.Base64 })
      const form = imagenComoArchivo({ uri: ruta, mimeType: 'image/png' }, 'firma-contratante.png', 'archivo')
      const r = await atualcanceApi.subirDocumento('FIRMA_CONTRATANTE', form)
      setFirmaUrl(r.url)
      setIntegrantes((l) => l.map((i) => ({ ...i, firmaTipo: 'MANUSCRITA', firmaUrl: r.url })))
    } catch (e) {
      setFirmaPng(null)
      setError('No se pudo guardar la firma. Vuelve a firmar. ' + mensajeDeError(e))
    } finally {
      setGuardandoFirma(false)
    }
  }, [])
  const borrarFirma = useCallback(() => {
    setFirmaPng(null)
    setFirmaUrl(null)
    setIntegrantes((l) => l.map((i) => ({ ...i, firmaTipo: '', firmaUrl: '' })))
  }, [])

  // ── Cotizar ──
  const cotizar = useCallback(async () => {
    if (!planId) { setError('Selecciona un plan'); return }
    if (!integrantes.length) { setError('Agrega al menos el titular'); return }
    setCargando(true)
    setError(null)
    try {
      const c = await atualcanceApi.cotizar(planId, vigenciaDesde, integrantes.map((i) => ({
        parentesco: i.parentesco,
        fechaNacimiento: i.persona.fechaNacimiento ?? '',
        sexo: i.persona.sexo ?? '',
        maternidad: i.maternidad,
        patologiasDeclaradas: i.patologias,
        alturaCm: i.alturaCm,
        pesoKg: i.pesoKg,
      })))
      setCotizacion(c)
    } catch (e) {
      setError(mensajeDeError(e) || 'No se pudo cotizar')
    } finally {
      setCargando(false)
    }
  }, [planId, vigenciaDesde, integrantes])

  // ── Validación por paso (lo que falta se muestra en pantalla; sin faltantes se avanza) ──
  const faltantes = useMemo<string[]>(() => {
    const faltan: string[] = []
    const persona = (p: AtaDatosPersona, quien: string, conSexo = true) => {
      if (vacio(p.numeroDocumento)) faltan.push(`${quien}: documento`)
      if (vacio(p.nombres)) faltan.push(`${quien}: nombres`)
      if (vacio(p.apellidos)) faltan.push(`${quien}: apellidos`)
      if (vacio(p.fechaNacimiento)) faltan.push(`${quien}: fecha de nacimiento`)
      if (conSexo && vacio(p.sexo)) faltan.push(`${quien}: sexo`)
    }
    if (paso === 'solicitud') {
      if (!planId) faltan.push('Selecciona el plan')
      if (!titular) faltan.push('Agrega al titular')
      if (!cotizacion) faltan.push('Pulsa «Validar admisibilidad» para comprobar edades y precio')
      else if (titularRechazado) faltan.push('El titular no es admisible: no se puede emitir este contrato')
      persona(contratante, 'Contratante', false)
      if (soloDigitos(contratante.telefono).length < 10) faltan.push('Contratante: teléfono de al menos 10 dígitos')
      if (!correoValido(contratante.correo)) faltan.push('Contratante: correo válido')
      if (titular) {
        persona(titular.persona, 'Titular')
        if (vacio(titular.persona.rif)) faltan.push('Titular: RIF')
      }
      beneficiarios.forEach((b, i) => persona(b.persona, `${ETIQUETA_PARENTESCO[b.parentesco] ?? 'Beneficiario'} ${i + 1}`))
      if (!cotizacion || cotizacion.lineas.length !== integrantes.length) faltan.push('Vuelve a validar la admisibilidad: cambió el grupo familiar')
      for (const i of integrantes) if (noAsegurable(i)) faltan.push(`${ETIQUETA_PARENTESCO[i.parentesco]} no es asegurable: quítalo del grupo familiar`)
      if (!declaracionAceptada) faltan.push('Falta aceptar la declaración jurada de salud')
      if (guardandoFirma) faltan.push('Guardando la firma…')
      else if (!firmaUrl) faltan.push('Falta la firma del contratante')
    } else if (paso === 'expediente') {
      for (const d of TIPOS_DOC_EXPEDIENTE) if (d.obligatorio && !documentoDe(d.tipo)) faltan.push(`Falta ${d.etiqueta.toLowerCase()}`)
      for (const b of beneficiarios) if (!documentoDe('CI_AFILIADO', b.persona.numeroDocumento)) faltan.push(`Falta la cédula o partida de ${ETIQUETA_PARENTESCO[b.parentesco]} ${b.persona.numeroDocumento || ''}`.trim())
    }
    return faltan
  }, [paso, planId, titular, cotizacion, titularRechazado, contratante, beneficiarios, integrantes, noAsegurable, declaracionAceptada, guardandoFirma, firmaUrl, documentoDe])
  const puedeContinuar = faltantes.length === 0

  const continuar = useCallback(() => {
    setError(null)
    const i = ATA_PASOS.findIndex((p) => p.id === paso)
    if (i >= 0 && i < ATA_PASOS.length - 1) setPaso(ATA_PASOS[i + 1].id)
    if (paso === 'expediente') void cotizar() // refresca precio antes del resumen
  }, [paso, cotizar])
  const anterior = useCallback(() => {
    setError(null)
    const i = ATA_PASOS.findIndex((p) => p.id === paso)
    if (i > 0) setPaso(ATA_PASOS[i - 1].id)
  }, [paso])

  // ── Emitir (y encadenar el cobro de la cuota 1) ──
  const cobroPorBanco = metodoPrimeraCuota === 'DEBITO_INMEDIATO' || metodoPrimeraCuota === 'PAGO_MOVIL'

  const prepararCobroBancario = useCallback(async (numeroContrato: string) => {
    if (enlaceCobro) { setFaseCobro('datos'); return }
    setCobrando(true)
    try {
      const e = await atualcanceApi.enviarEnlacePago(numeroContrato, 1, false)
      setEnlaceCobro(e)
      setFaseCobro('datos')
      setTelefonoPago((t) => t || soloDigitos(contratante.telefono))
      setCedulaPago((c) => c || (contratante.numeroDocumento ?? ''))
    } catch (e) {
      setError(mensajeDeError(e) || 'No se pudo preparar el cobro')
    } finally {
      setCobrando(false)
    }
  }, [enlaceCobro, contratante])

  const emitir = useCallback(async () => {
    setCargando(true)
    setError(null)
    const contr = contratanteEsTitular ? { ...(titular?.persona ?? { numeroDocumento: '' }), ...contratante } : contratante
    const datosDelTitular = contratanteEsTitular ? { estado: contr.estado, ciudad: contr.ciudad, estadoCivil: contr.estadoCivil } : {}
    const conContacto = (i: AtaIntegrante): AtaDatosPersona => {
      if (!i.contactoIgualTitular) return i.persona
      const t = titular?.persona
      return {
        ...i.persona,
        telefono: t?.telefono || contr.telefono || '',
        correo: t?.correo || contr.correo || '',
        direccion: t?.direccion || contr.direccion || '',
        estado: t?.estado || contr.estado || '',
        ciudad: t?.ciudad || contr.ciudad || '',
      }
    }
    try {
      const r = await atualcanceApi.emitir({
        planId,
        modalidadCobro,
        frecuenciaPago,
        contratante: contr,
        afiliados: integrantes.map((i) => ({
          parentesco: i.parentesco,
          persona: i.parentesco === 'TITULAR' ? { ...i.persona, ...datosDelTitular } : conContacto(i),
          maternidad: i.maternidad,
          patologiasDeclaradas: i.patologias,
          alturaCm: i.alturaCm,
          pesoKg: i.pesoKg,
          respuestasJson: JSON.stringify({ ...i.respuestas, patologias: i.patologias }),
          aceptoDeclaracion: i.aceptoDeclaracion,
          firmaTipo: i.firmaTipo || 'MANUSCRITA',
          firmaUrl: i.firmaUrl,
        })),
        barecaId: user?.barecaId ?? null,
        oficinaRegionalId: user?.oficinaRegionalId ?? null,
        distribuidorId: user?.distribuidorId ?? null,
        kioscoId: user?.kioskoId ?? null,
        usuarioVendedor: user?.email ?? '',
        clienteEmail: contr.correo,
        clienteTelefono: contr.telefono,
        documentos,
        observaciones,
      })
      setResultado(r)
      setPaso('resultado')
      void marcarVentaHoy(user?.loginId)
      // La cuota 1 se cobra en cuanto existe el contrato: es parte de la emisión.
      if (cobroPorBanco) await prepararCobroBancario(r.numeroContrato)
    } catch (e) {
      setError(mensajeDeError(e) || 'No se pudo emitir el contrato')
    } finally {
      setCargando(false)
    }
  }, [contratanteEsTitular, titular, contratante, planId, modalidadCobro, frecuenciaPago, integrantes, user, documentos, observaciones, cobroPorBanco, prepararCobroBancario])

  // ── Cobro cuota 1 ──
  const montoBsCobro = useMemo<number | null>(() => {
    if (enlaceCobro?.montoBs != null) return enlaceCobro.montoBs
    const cuota = opcionFrecuencia?.cuotaUsd
    return cuota != null && tasaBcv > 0 ? Math.round(cuota * tasaBcv * 100) / 100 : null
  }, [enlaceCobro, opcionFrecuencia, tasaBcv])
  const saldoAlcanza = montoBsCobro != null && montoBsCobro > 0 && walletSaldo >= montoBsCobro

  const detenerOtp = () => { if (otpTimer.current) { clearInterval(otpTimer.current); otpTimer.current = null } }
  const iniciarOtp = () => {
    detenerOtp()
    setOtpRestante(OTP_VIGENCIA_S)
    otpTimer.current = setInterval(() => setOtpRestante((t) => { if (t <= 1) { detenerOtp(); return 0 } return t - 1 }), 1000)
  }
  const volverADatos = useCallback(() => { detenerOtp(); setOtp(''); setFaseCobro('datos') }, [])
  const cambiarMetodoCobro = useCallback((m: MetodoPrimeraCuota) => {
    setMetodoPrimeraCuota(m); setFaseCobro('datos'); setOtp(''); setReferenciaPago(''); setError(null)
  }, [])

  const cedulaDelPagador = () => cedulaParaPasarela(cedulaPago, pasarela === 'PLAZA', contratante.tipoDocumento || 'V')
  const montoCobro = () => (MONTO_REAL ? Number(enlaceCobro?.montoBs ?? 0).toFixed(2) : '1.00')

  /** Efectivo/transferencia: se registra directo. Banco: se prepara el enlace. */
  const cobrarPrimeraCuota = useCallback(async () => {
    if (!resultado || cobrando) return
    if (cobroPorBanco) { await prepararCobroBancario(resultado.numeroContrato); return }
    if (metodoPrimeraCuota === 'TRANSFERENCIA' && !referenciaPago.trim()) { setError('Escribe la referencia de la transferencia'); return }
    setCobrando(true); setError(null)
    try {
      const p = await atualcanceApi.registrarPago(resultado.numeroContrato, {
        numeroCuota: 1, metodoPago: metodoPrimeraCuota, referencia: referenciaPago.trim() || null,
        fechaTransferencia: fechaTransferencia || null, registradaPor: user?.email ?? 'vendedor',
      })
      setPrimeraCobrada({ montoBs: p.montoBs, tasa: p.tasaBcv }); setFaseCobro('listo')
    } catch (e) { setError(mensajeDeError(e) || 'No se pudo registrar el pago de la primera cuota') }
    finally { setCobrando(false) }
  }, [resultado, cobrando, cobroPorBanco, prepararCobroBancario, metodoPrimeraCuota, referenciaPago, fechaTransferencia, user])

  const pagarConBilletera = useCallback(async () => {
    const actor = actorDe(user)
    if (!resultado || cobrando || !saldoAlcanza) return
    if (!actor) { setError('Tu usuario no tiene billetera asociada.'); return }
    setCobrando(true); setError(null)
    try {
      const p = await atualcanceApi.pagarCuotaConBilletera(resultado.numeroContrato, 1, actor.tipo, actor.uuid)
      setPrimeraCobrada({ montoBs: p.montoBs, tasa: p.tasaBcv }); setFaseCobro('listo')
      setWalletSaldo((s) => Math.max(0, s - p.montoBs))
    } catch (e) { setError(mensajeDeError(e) || 'No se pudo debitar de la billetera') }
    finally { setCobrando(false) }
  }, [user, resultado, cobrando, saldoAlcanza])

  const solicitarOtp = useCallback(async () => {
    if (!enlaceCobro || cobrando) return
    if (!banco || soloDigitos(telefonoPago).length < 10 || cedulaPago.trim().length < 6) { setError('Completa banco, teléfono y cédula del pagador'); return }
    setCobrando(true); setError(null)
    try {
      const r = await atualcanceApi.solicitarOtp(enlaceCobro.token, {
        banco, telefono: soloDigitos(telefonoPago), cedula: cedulaDelPagador(), monto: montoCobro(), isBancoPlaza: pasarela === 'PLAZA',
      })
      if (r?.error) { setError(r.message ?? 'No se pudo generar el código OTP'); return }
      setOtp(''); setFaseCobro('otp'); iniciarOtp()
    } catch (e) { setError(mensajeDeError(e) || 'No se pudo generar el código OTP') }
    finally { setCobrando(false) }
  }, [enlaceCobro, cobrando, banco, telefonoPago, cedulaPago, pasarela, contratante]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Cierra el cobro contra el enlace: cuota pagada, recibo y comisiones. */
  const cerrarCobroBancario = useCallback(async (referencia: string, idOperacion: string, metodo: string) => {
    if (!enlaceCobro) return
    try {
      await atualcanceApi.confirmarPagoEnlace(enlaceCobro.token, { paymentReference: referencia, paymentOperationId: idOperacion, metodoPago: metodo })
      setPrimeraCobrada({ montoBs: enlaceCobro.montoBs, tasa: enlaceCobro.tasaBcv }); setFaseCobro('listo')
    } catch (e) {
      // El banco ya debitó: no se puede volver a cobrar, hay que conciliar.
      setError(`El pago se debitó (ref. ${referencia}) pero no se pudo registrar. No cobres de nuevo: pásale la referencia a administración. ${mensajeDeError(e)}`)
    } finally { setCobrando(false) }
  }, [enlaceCobro])

  const consultarDebito = useCallback(async (op: { idOperacion: string; endtoend?: string; referenciaC?: string; monto?: string }) => {
    const esPlaza = pasarela === 'PLAZA'
    for (let intento = 0; intento < 20; intento++) {
      if (!vivo.current) return
      if (intento > 0) await sleep(6000)
      try {
        const r = await paymentApi.consultarOperacion({
          idOperacion: op.idOperacion, isBancoPlaza: esPlaza, idCliente: esPlaza ? ID_CLIENTE_PLAZA : '',
          endtoend: op.endtoend || '', reference_c: op.referenciaC || '', monto: op.monto || '',
        })
        const d: any = r?.data
        if (d && esCodigoAprobado(d.code) && (d.success || esPlaza)) { await cerrarCobroBancario(d.reference || op.idOperacion, op.idOperacion, 'DEBITO_INMEDIATO'); return }
        if (d?.code && !esCodigoPendiente(d.code) && !esCodigoAprobado(d.code)) { setCobrando(false); setError(traducirCodigoBanco(d.code)); return }
      } catch { /* reintenta */ }
    }
    setCobrando(false)
    setError('El banco no confirmó la operación. Si el monto fue debitado, no cobres de nuevo: valida con administración.')
  }, [pasarela, cerrarCobroBancario])

  const confirmarDebito = useCallback(async () => {
    if (!enlaceCobro || !otp.trim() || cobrando) { setError('Ingresa el código OTP'); return }
    setCobrando(true); setError(null)
    const esPlaza = pasarela === 'PLAZA'
    const monto = montoCobro()
    try {
      const r = await paymentApi.debitoInmediato({
        banco, monto, telefono: soloDigitos(telefonoPago), cedula: cedulaDelPagador(),
        nombre: [contratante.nombres, contratante.apellidos].filter(Boolean).join(' ') || 'Cliente Bareca',
        otp: otp.trim(), concepto: `ATA ${resultado?.numeroContrato ?? ''} cuota 1`.trim(),
        collectionGateway: pasarela, isBancoPlaza: esPlaza,
      })
      const d = r?.data
      if (!d) { setCobrando(false); setError('El banco no respondió a la operación. Vuelve a intentarlo.'); return }
      if (esCodigoAprobado(d.code) && d.reference && !esPlaza) { await cerrarCobroBancario(d.reference, d.id ?? '', 'DEBITO_INMEDIATO'); return }
      if (esCodigoPendiente(d.code) || (esPlaza && d.code === '0000')) {
        await consultarDebito({ idOperacion: d.id ?? '', endtoend: d.endtoend, referenciaC: d.reference_c, monto: d.monto || monto }); return
      }
      setCobrando(false)
      setError(d.code ? traducirCodigoBanco(d.code) : 'El banco no aceptó la operación. Verifica los datos del titular y el código OTP.')
    } catch (e) { setCobrando(false); setError(mensajeDeError(e) || 'No se pudo procesar el pago') }
  }, [enlaceCobro, otp, cobrando, pasarela, banco, telefonoPago, cedulaPago, contratante, resultado, cerrarCobroBancario, consultarDebito]) // eslint-disable-line react-hooks/exhaustive-deps

  const esperarPagoMovil = useCallback(async () => {
    if (!enlaceCobro || cobrando) return
    if (soloDigitos(telefonoPago).length < 10) { setError('Indica el teléfono desde el que se hace el pago móvil'); return }
    setCobrando(true); setError(null)
    try {
      await atualcanceApi.esperarPagoMovil(enlaceCobro.token, soloDigitos(telefonoPago))
      setFaseCobro('esperando')
      setCobrando(false)
      for (let intento = 0; intento <= 120; intento++) {
        if (!vivo.current) return
        await sleep(5000)
        try {
          const e = await atualcanceApi.estadoEnlace(enlaceCobro.token)
          if (e.estado === 'PAGADO') { setPrimeraCobrada({ montoBs: e.montoBs, tasa: e.tasaUsd }); setFaseCobro('listo'); return }
        } catch { /* sigue */ }
      }
      setError('No llegó la confirmación del pago. Si ya se hizo, no lo repitas: aparecerá en la cobranza.')
      setFaseCobro('datos')
    } catch (e) { setCobrando(false); setError(mensajeDeError(e) || 'No se pudo registrar el teléfono') }
  }, [enlaceCobro, cobrando, telefonoPago])

  const verContrato = useCallback(async () => {
    const n = resultado?.numeroContrato
    if (!n) return
    try { setDetalle(await atualcanceApi.consultar(n)) } catch (e) { setError(mensajeDeError(e) || 'No se pudo cargar el contrato') }
  }, [resultado])

  const reiniciar = useCallback(() => {
    setPaso('solicitud'); setIntegrantes([nuevoIntegrante('TITULAR')]); setDocumentos([]); setCotizacion(null)
    setResultado(null); setDetalle(null); setContratanteState({ numeroDocumento: '', tipoDocumento: 'V' }); setContratanteEsTitularState(false)
    setObservaciones(''); setDeclaracionAceptadaState(false); setFirmaUrl(null); setFirmaPng(null)
    setMetodoPrimeraCuota('DEBITO_INMEDIATO'); setFaseCobro('datos'); setEnlaceCobro(null); setPrimeraCobrada(null)
    setBanco(''); setTelefonoPago(''); setCedulaPago(''); setOtp(''); setReferenciaPago(''); setFechaTransferencia('')
    setError(null); detenerOtp()
  }, [])

  return {
    // estado
    paso, catalogo, cargando, error, setError,
    planId, setPlanId, plan, vigenciaDesde, modalidadCobro, setModalidadCobro, frecuenciaPago, setFrecuenciaPago,
    contratante, setContratante, setContratanteState, contratanteEsTitular, setContratanteEsTitular,
    integrantes, titular, beneficiarios, actualizarIntegrante, setPersona, agregarIntegrante, quitarIntegrante,
    alternarPatologia, responder, respuestaSiNo, detalleSiNo, responderSiNo, responderDetalle, noAsegurable,
    declaracionAceptada, setDeclaracionAceptada, firmaUrl, firmaPng, guardandoFirma, guardarFirma, borrarFirma,
    documentos, documentoDe, quitarDocumento, cargarDocumento, subiendo, claveDoc, leerCedula, leyendoCedula,
    cotizacion, cotizar, lineaDe, lineasElegibles, lineasRechazadas, titularRechazado, opcionFrecuencia,
    observaciones, setObservaciones, faltantes, puedeContinuar, continuar, anterior, setPaso,
    // emisión
    resultado, detalle, verContrato, emitir, reiniciar,
    // cobro
    metodoPrimeraCuota, cambiarMetodoCobro, faseCobro, enlaceCobro, cobrando, primeraCobrada, cobroPorBanco,
    pasarela, setPasarela, banco, setBanco, bancos, telefonoPago, setTelefonoPago, cedulaPago, setCedulaPago,
    otp, setOtp, otpRestante, referenciaPago, setReferenciaPago, fechaTransferencia, setFechaTransferencia,
    tasaBcv, montoBsCobro, walletSaldo, saldoAlcanza,
    cobrarPrimeraCuota, pagarConBilletera, solicitarOtp, confirmarDebito, esperarPagoMovil, volverADatos,
  }
}

export type AtaWizard = ReturnType<typeof useAtaWizard>
