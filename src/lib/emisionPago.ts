/**
 * emisionPago — orquestación del pago/emisión, portada 1:1 del portal web
 * (PaymentStepStateService + RcvFlowStrategy/FuneralFlowStrategy).
 *
 * Flujo Débito Inmediato (RCV):
 *   1. prePaymentChecks: /policies/polizas/v1/vigente/{placa}
 *   2. stagear cliente + vehículo → clienteId, registroVehiculoId
 *   3. crear orden: /policies/orden-seguros/v1/addorden-client
 *   4. débito con OTP: /policies/orden-seguros/debito-inmediato
 *   5. polling: /policies/orden-seguros/consultar-operacion (20×6s)
 *   6. finalizar: /payments/finalize-policy → { numeroPoliza, urlPoliza, urlCarnetPoliza }
 *
 * Flujo Pago Móvil: crea la orden (-pagoMovil) y espera el pago por DOS canales, como
 * la web — socket.io en tiempo real (`payment-status-update`) + polling de respaldo a
 * /webhook/status/{numeroOrden} (60×10s). Al detectar el pago, finaliza igual. El
 * banco emisor de la orden PM va fijo '0169' (Mi Banco/R4), como en el portal.
 *
 * Regla QA: en QA `montoReal=false` → todo cobro real es de 1 Bs (repetible).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clientStageApi,
  funerarioApi,
  paymentApi,
  vehiculoRegApi,
  walletApi,
  type Banco,
  type GatewayPago,
} from './endpoints'
import { mensajeDeError } from './api'
import { escucharPagoMovil } from './socketPago'
import { marcarVentaHoy } from './ventaLocal'
import { actorUuid } from './roles'
import type { DatosCliente } from '../components/PasoCliente'

/** ¿Se cobra el monto real? En QA (config "claude") es false → 1 Bs. */
export const MONTO_REAL = String(process.env.EXPO_PUBLIC_MONTO_REAL ?? '').toLowerCase() === 'true'
const CHANNEL_ID = process.env.EXPO_PUBLIC_CHANNEL_ID ?? 'aaec98eb-add7-4f39-bec8-1fe8a8409862'

export const DEBITO_ESPERA_S = 150
export const PM_ESPERA_S = 300
const POLL_DEBITO_MAX = 20
const POLL_DEBITO_MS = 6000
const POLL_PM_MAX = 60
const POLL_PM_MS = 10000

export type OtpState =
  | 'idle'
  | 'sending'
  | 'sent'
  | 'verifying'
  | 'verified'
  | 'error'
  | 'pollingFailed'
  | 'awaitingPayment'

export type MetodoPago = 'DEBITO' | 'PAGO_MOVIL' | 'WALLET'

export interface DetallesBanco {
  banco: string
  telefonoAsociado: string
  cedulaTitular: string
  telefonoPago?: string
}

export interface SaleDataVenta {
  tipo: 'rcv' | 'funerario'
  user: any
  productoId: string | null
  grupoId: string | null
  selectedProviderName?: string
  /** proveedorId (UUID) ya resuelto en la cotización (cruzando producto.proveedor.id). */
  proveedorId?: string
  proveedores: any[]
  plan: any
  cliente: DatosCliente
  conductorTipo: 'tomador' | 'otro'
  conductorDatos?: { tipoDoc: string; cedula: string; nombres: string; apellidos: string; telefono?: string }
  apovOn: boolean
  apov: any
  puestos: number
  gruaOn: boolean
  /** Primas de servicios adicionales en la moneda del plan (para el order payload). */
  valorAsistencia?: number
  valorGruaAdicional?: number
  // Funerario
  planFun?: any
  planTipoFun?: 'individual' | 'familiar'
  beneficiarios?: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const soloDigitos = (s: string) => (s || '').replace(/[^0-9]/g, '')
/** Documento SIN guion, como lo espera el backend (igual que el OCR): "V18815250". */
const docSinGuion = (tipoDoc: string, cedula: string) => `${(tipoDoc || 'V').toUpperCase()}${soloDigitos(cedula)}`

/** Rellena a 8 dígitos las cédulas para Banco Plaza (mantiene prefijo). */
function padCedula(cedula: string): string {
  if (!cedula) return ''
  const clean = cedula.toString().trim().toUpperCase()
  const m = clean.match(/^([VEJGP])(\d+)$/i)
  if (m) {
    const [, prefix, digits] = m
    return digits.length < 8 ? prefix + digits.padStart(8, '0') : clean
  }
  if (/^\d+$/.test(clean) && clean.length < 8) return clean.padStart(8, '0')
  return clean
}

/** Traduce el código del banco a un mensaje para el usuario (mapa del portal). */
export function traducirCodigoBanco(code: string): string {
  const m: Record<string, string> = {
    ACCP: 'Operación Aceptada.',
    '0000': 'Transacción Exitosa / Enviada a BCV.',
    AM04: 'Saldo insuficiente. Por favor verifica tu cuenta.',
    '0016': 'Saldo insuficiente.',
    '0042': 'Monto excede el saldo disponible.',
    AM02: 'Monto de la transacción no permitido (supera límites o es inválido).',
    '0033': 'Excede el límite diario permitido.',
    '0049': 'Excede el límite configurado.',
    '0032': 'Excede cantidad de operaciones diarias.',
    MD15: 'Monto incorrecto o inválido.',
    CH20: 'Formato de monto incorrecto (decimales).',
    AC01: 'Número de cuenta o cédula incorrectos. Verifica los datos del titular.',
    '0030': 'Cédula beneficiaria no coincide con cuenta destino.',
    AC04: 'La cuenta indicada está cancelada.',
    '0045': 'La cuenta no permite débitos.',
    '0048': 'La cuenta no permite créditos.',
    AC06: 'La cuenta indicada está bloqueada o inactiva.',
    AC09: 'Moneda no válida para esta operación.',
    BE01: 'Los datos del titular (Cédula/Nombre) no coinciden con la cuenta bancaria.',
    BE20: 'Longitud del nombre inválida.',
    MD01: 'La cuenta no posee afiliación para Débito Inmediato.',
    MD09: 'La afiliación del cliente está inactiva.',
    MD22: 'La afiliación del cliente está suspendida.',
    AB01: 'Tiempo de espera agotado (El banco no respondió a tiempo).',
    AB05: 'Tiempo máximo de espera superado (BCV o Banco Pagador).',
    AB07: 'El sistema del banco no está disponible (Agente fuera de línea).',
    '900': 'Sistema fuera de línea.',
    '0001': 'Sistema fuera de la franja establecida.',
    AG10: 'El banco receptor está suspendido o excluido temporalmente.',
    RC08: 'El banco no existe en el sistema de compensación.',
    ED05: 'Liquidación fallida en el sistema bancario.',
    TM01: 'Error técnico interno del banco.',
    '0096': 'Error interno del banco.',
    '9999': 'Error interno de procesamiento.',
    AM05: 'Operación duplicada. Ya se procesó un cobro idéntico recientemente.',
    DU01: 'Mensaje duplicado (Intento de reenvío inválido).',
    AG01: 'Transacción restringida por el banco.',
    AG09: 'Pago no recibido o no reconocido.',
    CUST: 'Operación cancelada por solicitud del usuario.',
    DS02: 'Operación cancelada.',
    RJCT: 'Operación rechazada por el BCV.',
    TKCM: 'Código de seguridad (Token/OTP) incorrecto o vencido.',
    '0075': 'Token único de la operación incorrecto.',
    '0085': 'Token único de la operación incorrecto.',
    '0100': 'Error validando token único de la operación.',
    '0065': 'Código único de operación incorrecto.',
    '0095': 'Error validando código único de operación.',
    VE01: 'Rechazo técnico por el banco pagador.',
    MD21: 'Cobro no permitido para este tipo de cuenta.',
    DT03: 'Fecha de procesamiento no válida (Día no bancario).',
    '0002': 'Parámetro obligatorio faltante.',
    '0003': 'Formato de parámetro incorrecto.',
    A001: 'Firma digital inválida.',
    A002: 'Firma digital vencida.',
    A003: 'Recurso no autorizado.',
    A004: 'API-KEY inválida o revocada.',
    AC00: 'Operación sin respuesta del banco pagador.',
    '0031': 'Transacción pendiente de liquidación por el BCV.',
    '13': 'Monto inválido. Por favor, verifica e intenta nuevamente.',
  }
  return m[code] || `El banco rechazó la operación (Código: ${code}). Verifica tus datos o contacta a tu banco.`
}

export interface Totales {
  totalRCV_VES: number
  totalAdicional_VES: number
  totalFull: number
  moneda: string
  baseForeign: number
  apovForeign: number
}

/** Calcula los totales en Bs a partir del plan y las tasas de cambio. */
export function calcularTotales(sd: SaleDataVenta, rates: Record<string, number>): Totales {
  if (sd.tipo === 'funerario') {
    const usd = rates.USD || 0
    const foreign = sd.planFun?.finalPrice ?? 0
    const base = round2(foreign * usd)
    return { totalRCV_VES: base, totalAdicional_VES: 0, totalFull: base, moneda: 'USD', baseForeign: foreign, apovForeign: 0 }
  }
  const simbolo = sd.plan?.simbolo || 'EUR'
  const rate = rates[simbolo] || rates.EUR || 0
  const baseForeign = sd.plan?.primaAnualTCR ?? sd.plan?.finalPrice ?? sd.plan?.prima ?? 0
  const totalRCV_VES = round2(baseForeign * rate)
  const apovVes = sd.apovOn && sd.apov ? (sd.apov.primaFinalTotal ?? 0) : 0
  return {
    totalRCV_VES,
    totalAdicional_VES: round2(apovVes),
    totalFull: round2(totalRCV_VES + apovVes),
    moneda: simbolo,
    baseForeign,
    apovForeign: sd.apovOn && sd.apov ? (sd.apov.primaFinal ?? 0) : 0,
  }
}

function resolverSeguro(nombre?: string): string {
  const n = (nombre || '').toUpperCase()
  if (n.includes('ESTAR')) return 'ESTARSEGUROS'
  if (n.includes('OCCIDENTAL')) return 'OCCIDENTAL'
  return 'CARONI'
}

function resolverProveedorId(sd: SaleDataVenta): string {
  // 1) El id ya resuelto en la cotización (cruzando producto.proveedor.id) — el correcto.
  if (sd.proveedorId) return sd.proveedorId
  const provs = sd.proveedores || []
  // 2) El nombre del producto ("RCV Nacional - Seguros La Occidental") CONTIENE el nombre
  //    del proveedor ("Seguros La Occidental"): buscamos al revés (provider ⊂ producto).
  const nombreProducto = (sd.selectedProviderName || '').toLowerCase()
  if (nombreProducto) {
    const f = provs.find((p: any) => {
      const pn = (p.nombre || '').toLowerCase()
      return pn && (nombreProducto.includes(pn) || pn.includes(nombreProducto))
    })
    if (f?.proveedorId) return f.proveedorId
  }
  // 3) Fallback por aseguradora del nombre del producto.
  const seguro = resolverSeguro(sd.selectedProviderName)
  const buscar = seguro === 'ESTARSEGUROS' ? 'estar' : seguro === 'OCCIDENTAL' ? 'occidental' : 'caroni'
  return provs.find((p: any) => (p.nombre || '').toLowerCase().includes(buscar))?.proveedorId ?? ''
}

interface EstadoOrden {
  numeroOrden?: string
  orderUuid?: string
  paymentOperationId?: string
  endtoend?: string
  reference_c?: string
  montoPlaza?: string
  clienteId?: string
  registroVehiculoId?: string
}

/** Extrae "Número de orden generado: N" del message del BFF. */
function extraerNumeroOrden(resp: any): { numeroOrden: string; uuid: string } {
  const msg: string = resp?.message ?? ''
  const data = resp?.data
  let numeroOrden = ''
  const m = msg.match(/generado:\s*([A-Za-z0-9-]+)/i)
  if (m) numeroOrden = m[1]
  if (!numeroOrden && typeof data === 'string') numeroOrden = data
  if (!numeroOrden && data?.numeroOrden) numeroOrden = data.numeroOrden
  const uuid = data?.id ?? data?.numeroOrden ?? numeroOrden
  if (!numeroOrden && !uuid) throw new Error('No se pudo leer el número de orden del banco.')
  return { numeroOrden: numeroOrden || uuid, uuid: uuid || numeroOrden }
}

export interface Emision {
  numeroPoliza?: string
  urlPoliza?: string
  urlCarnetPoliza?: string
  transactionId?: string
  condicionado?: string
  condicionadoTitulo?: string
}

/** Condicionado estático por aseguradora (igual que PROVIDER_DOCUMENTS del portal). */
function condicionadoDe(seguroONombre: string): { url: string; titulo: string } | null {
  const n = (seguroONombre || '').toUpperCase()
  const base = (process.env.EXPO_PUBLIC_BFF_URL ?? '').replace(/\/$/, '')
  if (n.includes('OCCIDENTAL')) return { url: `${base}/assets/condicionado-rcv-la-occidental.pdf`, titulo: 'Condicionado de Póliza RCV La Occidental' }
  if (n.includes('ESTAR')) return { url: `${base}/assets/condicionado-rcv-estar-seguros.pdf`, titulo: 'Condicionado de Póliza RCV Estar Seguros' }
  if (n.includes('CARONI')) return { url: `${base}/assets/contrato-servicio.pdf`, titulo: 'Condicionado de Póliza RCV Seguros Caroni' }
  return null
}

/**
 * Hook que expone el estado y las acciones del pago/emisión.
 * El componente le pasa el `SaleDataVenta` armado a cada acción.
 */
export function useEmisionPago() {
  const [otpState, setOtpState] = useState<OtpState>('idle')
  const [otpError, setOtpError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [emision, setEmision] = useState<Emision | null>(null)
  const [cargandoInicial, setCargandoInicial] = useState(false)
  const [rates, setRates] = useState<Record<string, number>>({ VES: 1, EUR: 0, USD: 0 })
  const [bancos, setBancos] = useState<Banco[]>([])
  const [gateways, setGateways] = useState<GatewayPago[]>([])
  const [pagoMovilHabilitado, setPagoMovilHabilitado] = useState(false)
  // Billetera: habilitada por la config del portal + saldo actual del vendedor.
  const [walletHabilitado, setWalletHabilitado] = useState(false)
  const [walletSaldo, setWalletSaldo] = useState(0)
  const [calculatedTotal, setCalculatedTotal] = useState<number | null>(null)
  const [maxDiscount, setMaxDiscount] = useState(0)
  const [ratesLoadError, setRatesLoadError] = useState(false)

  const orden = useRef<EstadoOrden>({})
  const bankRef = useRef<DetallesBanco | null>(null)
  const gatewayRef = useRef<string>('PLAZA')
  const metodoRef = useRef<MetodoPago>('DEBITO')
  const cancelar = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Pago móvil: limpieza del socket en vivo + guardia de resolución única (que no
  // finalicen a la vez el socket y el polling de respaldo).
  const pmCleanup = useRef<(() => void) | null>(null)
  const pmResuelto = useRef(false)

  /** Corta el canal en vivo del pago móvil (si está abierto). */
  const detenerSocketPM = useCallback(() => {
    if (pmCleanup.current) {
      pmCleanup.current()
      pmCleanup.current = null
    }
  }, [])

  // Cuenta regresiva según el estado (verifying=150s, awaitingPayment=300s).
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (otpState === 'verifying' || otpState === 'awaitingPayment') {
      setCountdown(otpState === 'verifying' ? DEBITO_ESPERA_S : PM_ESPERA_S)
      timerRef.current = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [otpState])

  useEffect(() => () => { cancelar.current = true; detenerSocketPM() }, [detenerSocketPM])

  const resetToIdle = useCallback(() => {
    cancelar.current = true
    pmResuelto.current = true
    detenerSocketPM()
    setOtpState('idle')
    setOtpError(null)
  }, [detenerSocketPM])

  /** Carga tasas, bancos, config de pasarela y el total con comisión. */
  const cargarInicial = useCallback(async (sd: SaleDataVenta) => {
    setCargandoInicial(true)
    setRatesLoadError(false)
    try {
      const [eur, usd, bancosR, cfg] = await Promise.all([
        paymentApi.convertirMoneda(1, 'EUR', 'VES').catch(() => null),
        paymentApi.convertirMoneda(1, 'USD', 'VES').catch(() => null),
        paymentApi.bancos().catch(() => null),
        paymentApi.config().catch(() => null),
      ])
      const rEUR = eur?.data ?? 0
      const rUSD = usd?.data ?? 0
      setRates({ VES: 1, EUR: rEUR, USD: rUSD })
      if (!rEUR && !rUSD) setRatesLoadError(true)
      setBancos(bancosR?.data ?? [])
      setGateways(cfg?.data?.gateways ?? [])
      setPagoMovilHabilitado(!!cfg?.data?.pagoMovilHabilitado)

      // Billetera: solo si el portal la habilita. El saldo se consulta aparte para
      // decidir si el método puede ofrecerse (debe cubrir el total).
      const walletOn = cfg?.data?.walletHabilitado === true
      setWalletHabilitado(walletOn)
      if (walletOn) {
        const uuid = actorUuid(sd.user) ?? ''
        if (uuid) {
          const w = await walletApi.miWallet(sd.user?.role, uuid).catch(() => null)
          setWalletSaldo(Number((w as any)?.saldo ?? (w as any)?.data?.saldo ?? 0) || 0)
        }
      }

      // Total con comisión (prepagada) o descuento máximo.
      const t = calcularTotales(sd, { VES: 1, EUR: rEUR, USD: rUSD })
      const base = {
        totalAdicional: t.totalAdicional_VES,
        totaRCV: t.totalRCV_VES,
        distribuidor: sd.user?.distribuidorId ?? null,
        kioscoId: sd.user?.kioskoId ?? null,
        productoId: sd.productoId ?? '',
      }
      try {
        if (sd.user?.comisionPrepagada) {
          const neto = await paymentApi.comisionPrepagada(base)
          setCalculatedTotal(typeof neto === 'number' ? neto : t.totalFull)
          setMaxDiscount(0)
        } else {
          const r = await paymentApi.comisionDescuento({ ...base, descuento: 0 })
          const pct = r?.porcentajeMaximo ?? 0
          setMaxDiscount(round2((t.totalFull * pct) / 100))
          setCalculatedTotal(t.totalFull)
        }
      } catch {
        setCalculatedTotal(t.totalFull)
        setMaxDiscount(0)
      }
    } finally {
      setCargandoInicial(false)
    }
  }, [])

  /** Crea/busca el cliente y registra el vehículo (RCV). Devuelve los ids. */
  const stagear = useCallback(async (sd: SaleDataVenta) => {
    if (orden.current.clienteId && orden.current.registroVehiculoId) return
    const c = sd.cliente
    const doc = docSinGuion(c.tipoDoc, c.cedula)
    // 1. Cliente: buscar por documento, si no existe crear.
    let clienteId = ''
    try {
      const busca = await clientStageApi.buscarPorDocumento(doc)
      const arr = Array.isArray(busca) ? busca : (busca?.content ?? busca?.data ?? [])
      clienteId = arr?.[0]?.id ?? ''
    } catch {
      /* ignore */
    }
    if (!clienteId) {
      const juridico = c.tipoDoc === 'J' || c.tipoDoc === 'G'
      const r = await clientStageApi.addCliente({
        nombres: c.nombres.toUpperCase(),
        apellidos: (juridico ? '' : c.apellidos).toUpperCase(),
        numeroDocumento: doc,
        tipoPersona: juridico ? 'JURIDICA' : 'NATURAL',
        razonSocial: juridico ? c.nombres.toUpperCase() : '',
        nacionalidad: c.tipoDoc === 'E' ? 'EXTRANJERO' : 'VENEZOLANO',
        fechaNacimiento: c.fechaNacimiento ?? '',
        gender: c.genero === 'F' ? 'FEMENINO' : 'MASCULINO',
      }).catch((e) => {
        throw new Error(`al registrar el cliente — ${mensajeDeError(e)}`)
      })
      clienteId = r?.data?.id ?? ''
      // Contacto (best-effort, no bloquea la venta).
      if (clienteId) {
        if (c.correo) clientStageApi.addCorreo({ cliente: clienteId, correo: c.correo }).catch(() => undefined)
        if (c.telefono) clientStageApi.addTelefono({ cliente: clienteId, numero: c.telefono }).catch(() => undefined)
        if (c.estadoId) {
          clientStageApi
            .addDireccion({ cliente: clienteId, estado: c.estadoId, ciudad: c.ciudadId, direccionCompleta: '' })
            .catch(() => undefined)
        }
      }
    }
    orden.current.clienteId = clienteId

    // 2. Vehículo (solo RCV). Como el portal: si el vehículo YA existe por placa se
    //    REUSA su id; solo si no existe se registra. Evita el "Registro de vehículo
    //    no existe" cuando la placa ya fue registrada (p.ej. en un reintento).
    if (sd.tipo === 'rcv') {
      const placa = (c.placa ?? '').trim().toUpperCase()
      // Reutiliza/recupera el registro por placa (como el portal). Sirve para evitar
      // duplicados Y para obtener el id cuando el POST de creación no lo devuelve.
      const buscarVehPorPlaca = async (): Promise<string> => {
        if (!placa) return ''
        const ex = await vehiculoRegApi.porPlaca(placa).catch(() => [] as any[])
        const arr = Array.isArray(ex) ? ex : ((ex as any)?.data ?? (ex as any)?.content ?? [])
        return arr.length > 0 && arr[0]?.id ? String(arr[0].id) : ''
      }
      let vehId = await buscarVehPorPlaca()
      if (!vehId) {
        const r = await vehiculoRegApi.addRegistro({
          peso: '0',
          seririalNIV: c.serialNiv,
          serialCarroceria: c.serialNiv,
          serialMotor: c.serialMotor,
          placa: c.placa,
          uso: 'PARTICULAR',
          tiposVehiculos: '',
          marcas: c.marca,
          modelos: c.modelo,
          annios: c.anio ? String(c.anio) : '',
          version: c.version ?? '',
          numeroPuesto: String(sd.puestos || 5),
          ejes: 2,
          coloresVehiculos: c.color,
          cliente: clienteId,
          catVersionAnioId: c.catVersionAnioId ? String(c.catVersionAnioId) : null,
          anioNum: c.anio ?? null,
        }).catch((e) => {
          throw new Error(`al registrar el vehículo — ${mensajeDeError(e)}`)
        })
        vehId = String((r as any)?.data?.id ?? (r as any)?.id ?? (r as any)?.data?.data?.id ?? '')
        // Si el POST creó el vehículo pero no devolvió el id, lo recuperamos por placa.
        if (!vehId) vehId = await buscarVehPorPlaca()
        if (!vehId) {
          const detalle = (r as any)?.message || (r as any)?.error?.message || JSON.stringify(r ?? {}).slice(0, 240)
          throw new Error(`al registrar el vehículo — respuesta sin id (${detalle})`)
        }
      }
      orden.current.registroVehiculoId = vehId
    }
  }, [])

  /** Construye el CreateOrderPayload de RCV. */
  const construirOrdenRcv = (sd: SaleDataVenta, bank: DetallesBanco, gateway: string, totalPagar: number, discountPct: number) => {
    const c = sd.cliente
    const t = calcularTotales(sd, rates)
    const cond = sd.conductorTipo === 'otro' && sd.conductorDatos ? sd.conductorDatos : null
    const nombreConductor = (cond ? cond.nombres : c.nombres).toUpperCase()
    const apellidoConductor = (cond ? cond.apellidos : c.apellidos).toUpperCase()
    const cedulaConductor = (cond ? docSinGuion(cond.tipoDoc, cond.cedula) : docSinGuion(c.tipoDoc, c.cedula)).toUpperCase()
    return {
      tipoPersona: 'NATURAL',
      barecaId: sd.user?.barecaId ?? '',
      oficinaRegionalId: sd.user?.oficinaRegionalId ?? '',
      distribuidor: sd.user?.distribuidorId ?? '',
      kioscoId: sd.user?.kioskoId ?? '',
      seguro: resolverSeguro(sd.selectedProviderName),
      additionalInformations: '[]',
      totalAdicional: t.totalAdicional_VES,
      tarifaCobertura: sd.plan?.id ?? '',
      totaRCV: t.totalRCV_VES,
      codigoIntermediario: sd.user?.code ?? '',
      clienteId: orden.current.clienteId ?? '',
      banco: bank.banco,
      telefono: bank.telefonoAsociado,
      cedula: gateway === 'PLAZA' ? padCedula(bank.cedulaTitular) : bank.cedulaTitular,
      nombreConductor,
      apellidoConductor,
      cedulaConductor,
      tipoPersonaConductor: 'NATURAL',
      nombreTitular: c.nombres.toUpperCase(),
      apellidoTitular: c.apellidos.toUpperCase(),
      cedulaTitular: docSinGuion(c.tipoDoc, c.cedula),
      tipoPersonaTitular: 'NATURAL',
      productoId: sd.productoId ?? '',
      comisionPrepagada: !!sd.user?.comisionPrepagada,
      totalPagar: MONTO_REAL ? round2(totalPagar) : 1,
      descuento: round2(discountPct),
      channelId: CHANNEL_ID,
      regiterVehiculoId: orden.current.registroVehiculoId ?? '',
      totalAdiccional: t.totalAdicional_VES,
      monedaOrigen: sd.plan?.simbolo ?? 'EUR',
      telefonoPago: bank.telefonoPago ?? bank.telefonoAsociado,
      grua: !!sd.gruaOn,
      apov: !!sd.apovOn,
      volarApovTotal: sd.apov?.primaFinal ?? 0,
      volarApovMuerte: sd.apov?.muerte ?? 0,
      volarApovInvalidez: sd.apov?.invalidez ?? 0,
      volarApovMedicos: sd.apov?.gastosMedicos ?? 0,
      volarApovFunerario: sd.apov?.servicioFunerarios ?? 0,
      valorAsistencia: sd.valorAsistencia ?? 0,
      valorGruaAdicional: sd.valorGruaAdicional ?? 0,
      collectionGateway: gateway,
      isBancoPlaza: gateway === 'PLAZA',
    }
  }

  /** Finaliza la póliza (crea cuadro + carnet) tras confirmar el pago. */
  const finalizar = useCallback(async (sd: SaleDataVenta, bank: DetallesBanco, gateway: string, paymentReference: string) => {
    // El pago ya se confirmó: registra localmente que se vendió hoy (Beca feliz al
    // instante, sin esperar a que el backend cuente la venta).
    void marcarVentaHoy(sd.user?.loginId)
    if (sd.tipo === 'funerario') {
      const r = await funerarioApi.finalizarPoliza({
        numeroOrden: orden.current.numeroOrden,
        tipoActorOrigen: sd.user?.role,
        actorOrigenUuid: actorUuid(sd.user) ?? '',
        productoId: sd.planFun?.productoId ?? '',
        proveedorId: sd.planFun?.proveedorId ?? '',
        referencia: paymentReference,
      })
      const d = r?.data ?? {}
      setEmision({
        numeroPoliza: d.numeroPolizas ?? d.numeroPoliza,
        urlPoliza: d.urlCudroPoliza ?? d.urlPoliza,
        urlCarnetPoliza: d.urlCarnetPoliza ?? d.urlAnexo,
        transactionId: d.numeroPolizas ?? d.numeroReferencia ?? orden.current.numeroOrden,
      })
      setOtpState('verified')
      return
    }
    const c = sd.cliente
    const payload = {
      numeroOrden: orden.current.numeroOrden,
      cedulaTitular: bank.cedulaTitular,
      paymentReference,
      paymentOperationId: orden.current.paymentOperationId ?? orden.current.orderUuid ?? '',
      tipoPlaca: sd.plan?.tipoPlaca ?? 'NACIONAL',
      proveedorId: resolverProveedorId(sd),
      productId: sd.productoId ?? '',
      actorData: {
        role: sd.user?.role,
        uuid: actorUuid(sd.user) ?? '',
        hierarchy: {
          barecaId: sd.user?.barecaId,
          oficinaRegionalId: sd.user?.oficinaRegionalId,
          distribuidorId: sd.user?.distribuidorId,
          kioskoId: sd.user?.kioskoId,
        },
      },
      clientData: c,
      vehicleData: {
        placa: c.placa,
        serialNiv: c.serialNiv,
        serialMotor: c.serialMotor,
        color: c.color,
        marca: c.marca,
        modelo: c.modelo,
        version: c.version,
        anio: c.anio,
        catVersionAnioId: c.catVersionAnioId,
        ownerNombre: c.nombres,
        ownerApellido: c.apellidos,
        ownerCedula: docSinGuion(c.tipoDoc, c.cedula),
      },
      driverData: {
        frequentDriverType: sd.conductorTipo,
        otherDriverNombre: sd.conductorDatos?.nombres,
        otherDriverApellido: sd.conductorDatos?.apellidos,
        otherDriverCedula: sd.conductorDatos ? docSinGuion(sd.conductorDatos.tipoDoc, sd.conductorDatos.cedula) : undefined,
        includeApov: sd.apovOn,
        apovCalculation: sd.apov,
      },
      planData: sd.plan,
      bankName: bank.banco,
      contactData: { correo: c.correo, telefono: c.telefono },
      insuredData: {
        firstName: c.nombres,
        lastName: c.apellidos,
        idNumber: docSinGuion(c.tipoDoc, c.cedula),
        razonSocial: null,
      },
      beneficiarios: [],
      collectionGateway: gateway,
      isBancoPlaza: gateway === 'PLAZA',
      idCliente: gateway === 'PLAZA' ? 'J303934870' : '',
      endtoend: orden.current.endtoend ?? '',
      reference_c: orden.current.reference_c ?? '',
      monto: orden.current.montoPlaza ?? '',
    }
    const r = await paymentApi.finalizePolicy(payload)
    const d = r?.data ?? {}
    const cond = condicionadoDe(resolverSeguro(sd.selectedProviderName))
    setEmision({
      numeroPoliza: d.numeroPoliza,
      urlPoliza: d.urlPoliza,
      urlCarnetPoliza: d.urlCarnetPoliza,
      transactionId: d.numeroPoliza,
      condicionado: cond?.url,
      condicionadoTitulo: cond?.titulo,
    })
    setOtpState('verified')
  }, [rates])

  /** Sondea el estado de la operación de débito hasta éxito/timeout. */
  const pollDebito = useCallback(async (sd: SaleDataVenta, bank: DetallesBanco, gateway: string): Promise<void> => {
    const isPlaza = gateway === 'PLAZA'
    const body = {
      idOperacion: orden.current.paymentOperationId,
      isBancoPlaza: isPlaza,
      idCliente: isPlaza ? 'J303934870' : '',
      endtoend: orden.current.endtoend,
      reference_c: orden.current.reference_c,
      monto: orden.current.montoPlaza,
    }
    for (let intento = 0; intento < POLL_DEBITO_MAX; intento++) {
      if (cancelar.current) return
      await sleep(intento === 0 ? 0 : POLL_DEBITO_MS)
      const r = await paymentApi.consultarOperacion(body)
      const d: any = r?.data ?? {}
      const exito = (d.code === 'ACCP' || d.code === '0000') && d.success
      if (exito && (d.reference || isPlaza)) {
        await finalizar(sd, bank, gateway, d.reference || orden.current.paymentOperationId || '')
        return
      }
      const pendiente = d.code === 'AC00' || d.code === '0031'
      if (!pendiente) throw new Error(traducirCodigoBanco(d.code))
    }
    // Timeout de polling → recuperación (sin cobrar de nuevo).
    const e: any = new Error('El banco está tardando en confirmar la operación.')
    e.tipo = 'POLLING_TIMEOUT'
    throw e
  }, [finalizar])

  /**
   * Espera la confirmación del pago móvil como la web: canal en TIEMPO REAL por
   * socket.io (`payment-status-update`) + polling HTTP de respaldo a
   * `/webhook/status/:numeroOrden`. Gana el primero que llegue; al detectar el pago
   * finaliza la póliza y la pantalla pasa a "procesado" (otpState = 'verified').
   */
  const pollPagoMovil = useCallback(async (sd: SaleDataVenta, bank: DetallesBanco, gateway: string) => {
    // Llave del webhook/sala = numeroOrden (así lo cachea/emite el BFF y lo referencia
    // el banco). En la orden PM el uuid coincide con el numeroOrden.
    const orderId = orden.current.numeroOrden || orden.current.orderUuid || ''
    pmResuelto.current = false

    // Resolución ÚNICA: socket o polling, lo que caiga primero (con guardia).
    const resolverExito = async (ref: string) => {
      if (pmResuelto.current || cancelar.current) return
      pmResuelto.current = true
      detenerSocketPM()
      try {
        await finalizar(sd, bank, gateway, ref)
      } catch (e) {
        setOtpState('error')
        setOtpError(mensajeDeError(e))
      }
    }
    const resolverFallo = () => {
      if (pmResuelto.current || cancelar.current) return
      pmResuelto.current = true
      detenerSocketPM()
      setOtpState('idle')
      setOtpError('El pago móvil fue rechazado.')
    }

    // 1) Canal en vivo (socket.io) — igual que la web: se une a la sala del numeroOrden.
    detenerSocketPM()
    pmCleanup.current = escucharPagoMovil(orderId, (data) => {
      const status = data?.status
      if (status === 'SUCCESS') void resolverExito(data?.policyNumber || `PM-${orderId.slice(0, 8)}`)
      else if (status === 'FAILURE') resolverFallo()
    })

    // 2) Respaldo por HTTP-polling (por si el socket no logra conectar / upgrade WS).
    for (let intento = 0; intento < POLL_PM_MAX; intento++) {
      if (cancelar.current || pmResuelto.current) return
      await sleep(POLL_PM_MS)
      if (cancelar.current || pmResuelto.current) return
      let d: any = { status: 'PENDING' }
      try {
        d = (await paymentApi.webhookStatus(orderId)) ?? d
      } catch {
        d = { status: 'PENDING' }
      }
      const status = d?.status ?? d?.data?.status
      if (status === 'SUCCESS') {
        await resolverExito(d?.policyNumber ?? d?.data?.policyNumber ?? `PM-${orderId.slice(0, 8)}`)
        return
      }
      if (status === 'FAILURE') {
        resolverFallo()
        return
      }
    }
    // Ni socket ni polling confirmaron en el tiempo máximo → "verificar de nuevo".
    if (!pmResuelto.current) {
      detenerSocketPM()
      setOtpState('pollingFailed')
    }
  }, [finalizar, detenerSocketPM])

  /** Paso 1: prepara, stagea y crea la orden. Débito → 'sent'; PM → 'awaitingPayment'. */
  const crearOrden = useCallback(
    async (sd: SaleDataVenta, opts: { metodo: MetodoPago; gateway: string; bank: DetallesBanco; descuento: number }) => {
      cancelar.current = false
      setOtpState('sending')
      setOtpError(null)
      bankRef.current = opts.bank
      gatewayRef.current = opts.gateway
      metodoRef.current = opts.metodo
      try {
        // 1. prePaymentChecks (RCV: vigente por placa).
        if (sd.tipo === 'rcv' && sd.cliente.placa) {
          const placa = sd.cliente.placa.toUpperCase().replace(/[^A-Z0-9]/g, '')
          try {
            const v = await paymentApi.vigentePorPlaca(placa)
            const num = v?.numeroPoliza ?? v?.data?.numeroPoliza
            const noExiste = v?.statusCode === 404 || (!num && !v?.data)
            if (num && !noExiste) {
              throw new Error(`Se detectó una póliza vigente (Nro: ${num}) para este vehículo. No se permite una nueva orden.`)
            }
          } catch (e: any) {
            if (/vigente/i.test(e?.message ?? '')) throw e
            // 404/errores de red del check no bloquean.
          }
        }

        // 2. Stagear cliente + vehículo.
        await stagear(sd)

        // 3. Total a pagar.
        const t = calcularTotales(sd, rates)
        let totalPagar = calculatedTotal ?? t.totalFull
        let discountPct = 0
        if (opts.descuento > 0 && !sd.user?.comisionPrepagada) {
          discountPct = round2((opts.descuento / t.totalFull) * 100)
          try {
            const r = await paymentApi.comisionDescuento({
              totalAdicional: t.totalAdicional_VES,
              totaRCV: t.totalRCV_VES,
              descuento: discountPct,
              distribuidor: sd.user?.distribuidorId ?? null,
              kioscoId: sd.user?.kioskoId ?? null,
              productoId: sd.productoId ?? '',
            })
            totalPagar = r?.monto ?? totalPagar
          } catch {
            /* usa el total sin descuento */
          }
        }
        orden.current.montoPlaza = String(MONTO_REAL ? round2(totalPagar) : 1)

        // 4-bis. BILLETERA: la orden se crea con `pagoConWallet`; el core debita el
        // saldo del vendedor (sin OTP) y devuelve en `data` la referencia del
        // movimiento. Con esa referencia se emite la póliza de una vez.
        if (opts.metodo === 'WALLET') {
          if (sd.tipo === 'funerario') {
            throw new Error('El pago con billetera aún no está disponible para el producto funerario.')
          }
          const totalCobrar = MONTO_REAL ? round2(totalPagar) : 1
          if (walletSaldo < totalCobrar) {
            throw new Error('El saldo de tu billetera no cubre el total de esta póliza.')
          }
          const body: any = construirOrdenRcv(sd, opts.bank, opts.gateway, totalPagar, discountPct)
          body.pagoConWallet = true
          let respW: any
          try {
            respW = await paymentApi.crearOrden(body)
          } catch (e) {
            throw new Error(`al pagar con la billetera — ${mensajeDeError(e)}`)
          }
          const referencia = respW?.data
          if (!referencia || typeof referencia !== 'string' || referencia.length < 8) {
            throw new Error(respW?.message || 'La billetera no pudo procesar el pago.')
          }
          const idsW = extraerNumeroOrden(respW)
          orden.current.numeroOrden = idsW.numeroOrden
          orden.current.orderUuid = idsW.uuid
          setOtpState('verifying')
          await finalizar(sd, opts.bank, opts.gateway, referencia)
          // Refresca el saldo mostrado tras el débito.
          const uuidW = actorUuid(sd.user) ?? ''
          if (uuidW) {
            const w = await walletApi.miWallet(sd.user?.role, uuidW).catch(() => null)
            if (w) setWalletSaldo(Number((w as any)?.saldo ?? (w as any)?.data?.saldo ?? 0) || 0)
          }
          return
        }

        // 4. Crear la orden (según tipo y método).
        let resp: any
        try {
          if (sd.tipo === 'funerario') {
            const body = construirOrdenFuneraria(sd, opts.bank, opts.gateway, totalPagar, discountPct)
            resp = opts.metodo === 'PAGO_MOVIL' ? await funerarioApi.crearOrdenPagoMovil(body) : await funerarioApi.crearOrden(body)
          } else {
            const body = construirOrdenRcv(sd, opts.bank, opts.gateway, totalPagar, discountPct)
            resp = opts.metodo === 'PAGO_MOVIL' ? await paymentApi.crearOrdenPagoMovil(body) : await paymentApi.crearOrden(body)
          }
        } catch (e) {
          throw new Error(`al crear la orden — ${mensajeDeError(e)}`)
        }
        const ids = extraerNumeroOrden(resp)
        orden.current.numeroOrden = ids.numeroOrden
        orden.current.orderUuid = ids.uuid

        // 5. Siguiente estado según método.
        if (opts.metodo === 'PAGO_MOVIL') {
          setOtpState('awaitingPayment')
          void pollPagoMovil(sd, opts.bank, opts.gateway)
        } else {
          setOtpState('sent')
        }
      } catch (e) {
        setOtpState('idle')
        setOtpError(mensajeDeError(e))
      }
    },
    [rates, calculatedTotal, stagear, pollPagoMovil, finalizar, walletSaldo],
  )

  /** Paso 2 (débito): envía el OTP, sondea y finaliza. */
  const confirmarOtp = useCallback(
    async (sd: SaleDataVenta, otp: string) => {
      const bank = bankRef.current
      const gateway = gatewayRef.current
      if (!bank || !orden.current.numeroOrden) {
        setOtpState('error')
        setOtpError('Faltan datos clave para procesar el débito.')
        return
      }
      cancelar.current = false
      setOtpState('verifying')
      setOtpError(null)
      try {
        const t = calcularTotales(sd, rates)
        const montoAprobado = calculatedTotal ?? t.totalFull
        const montoEnviado = MONTO_REAL ? montoAprobado.toFixed(2) : Number(1).toFixed(2)
        const c = sd.cliente
        const nombre = `${(c.nombres || '').trim().split(' ')[0]} ${(c.apellidos || '').trim().split(' ')[0]}`.trim()
        const debitBody = {
          banco: bank.banco,
          monto: montoEnviado,
          telefono: bank.telefonoAsociado,
          cedula: bank.cedulaTitular,
          nombre,
          otp,
          concepto: orden.current.numeroOrden || `Pago Poliza RCV ${c.placa || 'S/P'}`,
          collectionGateway: gateway,
          isBancoPlaza: gateway === 'PLAZA',
        }
        const r = await paymentApi.debitoInmediato(debitBody)
        const d: any = r?.data ?? {}
        orden.current.paymentOperationId = d.id
        orden.current.endtoend = d.endtoend
        orden.current.reference_c = d.reference_c
        orden.current.montoPlaza = d.monto || montoEnviado

        const isPlaza = gateway === 'PLAZA'
        if ((d.code === 'ACCP' || d.code === '0000') && d.reference && !isPlaza) {
          await finalizar(sd, bank, gateway, d.reference)
          return
        }
        const isPlazaSuccess = isPlaza && d.code === '0000'
        const isPending = d.code === 'AC00' || d.code === '0031'
        if (isPending || isPlazaSuccess) {
          await pollDebito(sd, bank, gateway)
          return
        }
        throw new Error(traducirCodigoBanco(d.code))
      } catch (e: any) {
        if (e?.tipo === 'POLLING_TIMEOUT' || /tiempo de espera|AB01/i.test(e?.message ?? '')) {
          setOtpState('pollingFailed')
          setOtpError(e?.message ?? 'El banco está tardando en responder.')
        } else {
          setOtpState('error')
          setOtpError(mensajeDeError(e))
        }
      }
    },
    [rates, calculatedTotal, finalizar, pollDebito],
  )

  /** Reintenta la consulta (pollingFailed) sin volver a cobrar. */
  const reintentar = useCallback(
    async (sd: SaleDataVenta) => {
      const bank = bankRef.current
      const gateway = gatewayRef.current
      if (!bank) return
      cancelar.current = false
      setOtpState('verifying')
      setOtpError(null)
      try {
        if (metodoRef.current === 'PAGO_MOVIL') await pollPagoMovil(sd, bank, gateway)
        else await pollDebito(sd, bank, gateway)
      } catch (e: any) {
        if (e?.tipo === 'POLLING_TIMEOUT') {
          setOtpState('pollingFailed')
          setOtpError(e?.message ?? null)
        } else {
          setOtpState('error')
          setOtpError(mensajeDeError(e))
        }
      }
    },
    [pollDebito, pollPagoMovil],
  )

  return {
    otpState,
    otpError,
    countdown,
    emision,
    rates,
    bancos,
    gateways,
    pagoMovilHabilitado,
    walletHabilitado,
    walletSaldo,
    calculatedTotal,
    maxDiscount,
    cargandoInicial,
    ratesLoadError,
    cargarInicial,
    crearOrden,
    confirmarOtp,
    reintentar,
    resetToIdle,
  }
}

/** CreateFuneralOrderPayload (best-effort desde los datos de la app). */
function construirOrdenFuneraria(sd: SaleDataVenta, bank: DetallesBanco, gateway: string, totalPagar: number, discountPct: number) {
  const c = sd.cliente
  const familiar = sd.planTipoFun === 'familiar'
  const parentescoTitular = c.genero === 'F' ? 'fa052ae5-b8b2-4cd9-b3e7-6747a4edeee7' : 'd875645a-34c4-4acf-9d48-521cb17f1290'
  return {
    barecaId: sd.user?.barecaId ?? '',
    oficinaRegionalId: sd.user?.oficinaRegionalId ?? '',
    distribuidor: sd.user?.distribuidorId ?? '',
    kioscoId: sd.user?.kioskoId ?? '',
    seguro: 'CARONI',
    clienteId: '',
    planId: sd.planFun?.id ?? '',
    isSimple: !familiar,
    asegurados: [
      {
        nombres: c.nombres.toUpperCase(),
        apellido: c.apellidos.toUpperCase(),
        numeroDocumento: docSinGuion(c.tipoDoc, c.cedula),
        sexo: c.genero === 'F' ? 'FEMENINO' : 'MASCULINO',
        nacionalidad: c.tipoDoc === 'E' ? 'EXTRANJERO' : 'VENEZOLANO',
        fechaNacimiento: c.fechaNacimiento ?? '',
        parentesco: { id: parentescoTitular },
      },
    ],
    banco: bank.banco,
    telefono: bank.telefonoAsociado,
    cedula: bank.cedulaTitular,
    isBancoPlaza: gateway === 'PLAZA',
    productoId: sd.planFun?.productoId ?? '',
    comisionPrepagada: !!sd.user?.comisionPrepagada,
    totalPagar: MONTO_REAL ? totalPagar : 1,
    descuento: discountPct,
    channelId: CHANNEL_ID,
    monedaOrigen: 'USD',
    telefonoPago: bank.telefonoPago ?? bank.telefonoAsociado,
  }
}
