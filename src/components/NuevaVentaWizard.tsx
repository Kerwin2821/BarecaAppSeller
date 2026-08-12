import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Image, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { funerarioApi, paymentApi, rcvApi, type ClaseVehiculo, type GrupoVehiculo, type PlanFunerario, type ProductoAseguradora, type Proveedor } from '../lib/endpoints'
import { ApiException, mensajeDeError } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  calcularTotales,
  useEmisionPago,
  MONTO_REAL,
  DEBITO_ESPERA_S,
  PM_ESPERA_S,
  type DetallesBanco,
  type Emision,
  type MetodoPago,
  type SaleDataVenta,
} from '../lib/emisionPago'
import { moneda, numero } from '../lib/formato'
import { Dropdown, type OpcionDrop } from './Dropdown'
import { LogoBanco } from './LogoBanco'
import { sonidoExito } from '../lib/sonido'
import { Spinner } from './Estados'
import { PasoCliente, type DatosCliente } from './PasoCliente'
import { useToast } from './Toast'
import { Alerta, Boton, Campo, Pildora, Tarjeta } from './Ui'
import { color } from '../lib/tema'

const BANCOS: OpcionDrop[] = [
  { valor: '0169', texto: '0169 — Mi Banco' },
  { valor: '0102', texto: '0102 — Banco de Venezuela' },
  { valor: '0105', texto: '0105 — Mercantil' },
  { valor: '0134', texto: '0134 — Banesco' },
  { valor: '0108', texto: '0108 — Provincial' },
  { valor: '0191', texto: '0191 — BNC' },
]

const TIPOS_DOC_TITULAR: OpcionDrop[] = [
  { valor: 'V', texto: 'V' },
  { valor: 'E', texto: 'E' },
  { valor: 'J', texto: 'J' },
  { valor: 'P', texto: 'P' },
]

type TipoSeguro = 'rcv' | 'funerario'

const PASOS = ['Cotización', 'Datos del Cliente', 'Conductor', 'Registro de Pago']

/** Tarjetas de tipo de seguro (como la web: RCV y Funerario activos; el resto "Próximamente"). */
const TIPOS: { valor: TipoSeguro | null; emoji: string; texto: string; activo: boolean }[] = [
  { valor: 'rcv', emoji: '🚗', texto: 'Vehículos (RCV)', activo: true },
  { valor: 'funerario', emoji: '🕊️', texto: 'Servicio Funerario', activo: true },
  { valor: null, emoji: '🚙', texto: 'Auto (Casco)', activo: false },
  { valor: null, emoji: '❤️', texto: 'Salud y Vida', activo: false },
  { valor: null, emoji: '🏠', texto: 'Hogar y Comercio', activo: false },
]

/** Información adicional de riesgo (toggles que ajustan el precio). */
const RIESGOS = [
  { id: 'inflamables', texto: 'Para vehículos destinados al transporte de materiales inflamables, corrosivos, tóxicos o explosivos' },
  { id: 'oficiales', texto: 'Para vehículos de cuerpos policiales, bomberos, ambulancia, empresas de seguridad o transporte de fondos' },
  { id: 'remolque', texto: 'Para vehículos que remolquen embarcaciones, motocicletas, casas rodantes, equipos deportivos u otros remolques' },
]

const aOpc = <T,>(xs: T[], id: (x: T) => string, txt: (x: T) => string): OpcionDrop[] =>
  xs.map((x) => ({ valor: id(x), texto: txt(x) }))

/** Logo de la aseguradora por nombre (igual que el quote-step del portal). */
const LOGOS_ASEG: { re: RegExp; src: number }[] = [
  { re: /caron/i, src: require('../../assets/logos/logo-caroni-color.png') },
  { re: /estar/i, src: require('../../assets/logos/logo-estar-seguros.png') },
  { re: /occidental/i, src: require('../../assets/logos/logo-laoccidental.png') },
]

/** Logo por plataforma de cobro (gateway): R4 / Banco Plaza. */
const LOGO_GATEWAY_R4 = require('../../assets/bancos/r4-logo.png')
const LOGO_GATEWAY_PLAZA = require('../../assets/bancos/banco-plaza-logo.png')
function logoGateway(g: { id?: string; nombre?: string }): number | null {
  const k = `${g?.id ?? ''} ${g?.nombre ?? ''}`.toLowerCase()
  if (k.includes('plaza')) return LOGO_GATEWAY_PLAZA
  if (k.includes('r4') || k.includes('red4')) return LOGO_GATEWAY_R4
  return null
}

/** Muestra el logo (a color) de la aseguradora sobre un fondo blanco para que se
 *  vea igual en tarjetas claras y en las seleccionadas (fondo azul). */
function LogoAseg({ nombre, alto = 28 }: { nombre?: string; fondoOscuro?: boolean; alto?: number }) {
  const logo = LOGOS_ASEG.find((l) => l.re.test(nombre || ''))
  if (!logo) return null
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'center' }}>
      <Image source={logo.src} resizeMode="contain" style={{ height: alto, width: 132 }} />
    </View>
  )
}

/** Monto del plan en Bs (numérico), 0 si no se puede resolver. */
function bsDePlan(plan: any): number {
  if (!plan) return 0
  const bs = plan.montoTotalVES ?? plan.totalVes ?? plan.primaTotalBs ?? plan.montoTotal ?? plan.finalTotalVES
  if (typeof bs === 'number' && bs > 0) return bs
  const tcr = plan.primaAnualTCR ?? plan.finalPrice ?? plan.prima
  const tasa = plan.tasaBcv ?? plan.tasaCambio ?? plan.tasa
  if (typeof tcr === 'number' && typeof tasa === 'number' && tasa > 0) return tcr * tasa
  return 0
}

/**
 * Nueva Venta — flujo RCV real (réplica del quote-step del portal):
 * tipo de seguro → aseguradora → clase + grupo de vehículo → info de riesgo →
 * Cotizar Planes → selección de plan. Clase/grupo/aseguradora usan endpoints
 * públicos; la cotización de planes (tarifa) requiere sesión.
 */
export function NuevaVentaWizard({ express = false }: { express?: boolean }) {
  const insets = useSafeAreaInsets()
  const [paso, setPaso] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const refCotizar = useRef<View>(null)
  const refPlanes = useRef<View>(null)
  const scrollY = useRef(0)
  const desplazarA = useCallback((ref: { current: View | null }) => {
    const sv = scrollRef.current
    const node = ref.current as any
    if (!sv || !node?.measure) return
    // `measure` da pageY (posición absoluta en la ventana). El ScrollView arranca
    // ~150px abajo (header + pasos); llevamos el marcador cerca de ese tope.
    node.measure((_x: number, _y: number, _w: number, _h: number, _pageX: number, pageY: number) => {
      if (typeof pageY !== 'number') return
      sv.scrollTo({ y: Math.max(0, scrollY.current + pageY - 150), animated: true })
    })
  }, [])
  // Al cambiar de paso, sube al inicio (p.ej. al pasar a Datos del Cliente → OCR).
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [paso])
  const [cargando, setCargando] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const setCarga = (k: string, v: boolean) => setCargando((c) => ({ ...c, [k]: v }))

  const [tipo, setTipo] = useState<TipoSeguro | null>(null)
  const [productos, setProductos] = useState<ProductoAseguradora[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productoId, setProductoId] = useState<string | null>(null)

  const [clases, setClases] = useState<ClaseVehiculo[]>([])
  const [grupos, setGrupos] = useState<GrupoVehiculo[]>([])
  const [claseId, setClaseId] = useState<string | null>(null)
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [riesgos, setRiesgos] = useState<Record<string, boolean>>({})
  const [riesgosAbierto, setRiesgosAbierto] = useState(false)

  const [planes, setPlanes] = useState<any[]>([])
  const [planIdx, setPlanIdx] = useState<number | null>(null)

  // ── Funerario (planes por edad; individual/familiar) ──
  const [planTipoFun, setPlanTipoFun] = useState<'individual' | 'familiar'>('individual')
  const [beneficiarios, setBeneficiarios] = useState('1')
  const [rangoEdad, setRangoEdad] = useState<'under65' | 'over65'>('under65')
  const [planesFun, setPlanesFun] = useState<PlanFunerario[]>([])
  const [planFunIdx, setPlanFunIdx] = useState<number | null>(null)
  const [cotizandoFun, setCotizandoFun] = useState(false)

  /** Plan funerario seleccionado, mapeado con su precio final (USD). */
  const planFunSel = useMemo(() => {
    if (planFunIdx == null) return null
    const p = planesFun[planFunIdx]
    if (!p) return null
    const familiar = planTipoFun === 'familiar'
    const cuenta = Math.max(1, Number(beneficiarios) || 1)
    const finalPrice = familiar ? p.primaAnualGrupo : p.primaAnualSeg * cuenta
    return { ...p, finalPrice, simbolo: 'USD', planType: planTipoFun, insuredCount: familiar ? undefined : cuenta, _fun: true as const }
  }, [planFunIdx, planesFun, planTipoFun, beneficiarios])

  const cotizarFun = useCallback(async () => {
    setCotizandoFun(true)
    setError(null)
    setPlanesFun([])
    setPlanFunIdx(null)
    try {
      const r = await funerarioApi.planes()
      const data = (Array.isArray(r) ? r : (r?.data ?? [])) as PlanFunerario[]
      const over65 = rangoEdad === 'over65'
      const filtrados = data.filter((p) => p.activo && (over65 ? p.escalaEdad.desde >= 66 : p.escalaEdad.desde < 66))
      setPlanesFun(filtrados)
      if (filtrados.length === 0) setError('No hay planes funerarios para ese rango de edad.')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCotizandoFun(false)
    }
  }, [rangoEdad])

  // Adicionales de la cotización (como la web): puestos + APOV + Grúa.
  const [puestos, setPuestos] = useState('5')
  const [apovOn, setApovOn] = useState(false)
  const [apov, setApov] = useState<any>(null)
  const [apovCargando, setApovCargando] = useState(false)
  const [gruaOn, setGruaOn] = useState(false)
  // Servicios adicionales que ofrece la aseguradora (Asistencia / Grúa por grupo).
  const [asistenciaOn, setAsistenciaOn] = useState(false)
  const [serviciosCfg, setServiciosCfg] = useState<any[]>([])
  const [gruaOfrecida, setGruaOfrecida] = useState(false)
  const [gruaPrima, setGruaPrima] = useState(0) // en la moneda del plan (EUR)
  const [tasa, setTasa] = useState<{ EUR: number; USD: number }>({ EUR: 0, USD: 0 })

  /** proveedorId (UUID) del producto seleccionado, como en la cotización. */
  const proveedorIdSel = useMemo(() => {
    const prod = productos.find((p) => p.productoId === productoId)
    return proveedores.find((p) => p.id === prod?.proveedor?.id)?.proveedorId ?? prod?.proveedor?.proveedorId ?? ''
  }, [productos, productoId, proveedores])

  // Tasa BCV (para convertir grúa/asistencia y el monto base a Bs).
  useEffect(() => {
    Promise.all([
      paymentApi.convertirMoneda(1, 'EUR', 'VES').catch(() => null),
      paymentApi.convertirMoneda(1, 'USD', 'VES').catch(() => null),
    ]).then(([e, u]) => setTasa({ EUR: (e as any)?.data ?? 0, USD: (u as any)?.data ?? 0 }))
  }, [])

  useEffect(() => {
    if (!apovOn) {
      setApov(null)
      return
    }
    const n = Number(puestos)
    if (!n || n < 1) return
    let vivo = true
    setApovCargando(true)
    rcvApi
      .apov(n, proveedorIdSel || undefined)
      .then((r) => vivo && setApov(r?.data ?? r))
      .catch(() => vivo && setApov(null))
      .finally(() => vivo && setApovCargando(false))
    return () => {
      vivo = false
    }
  }, [apovOn, puestos, proveedorIdSel])

  // Al seleccionar plan: carga servicios ofrecidos + prima de grúa por grupo.
  useEffect(() => {
    if (planIdx === null || !proveedorIdSel) {
      setServiciosCfg([])
      setGruaOfrecida(false)
      setGruaPrima(0)
      return
    }
    let vivo = true
    rcvApi
      .serviciosOfrecidos(proveedorIdSel)
      .then((r) => {
        if (!vivo) return
        const list = (Array.isArray(r) ? r : ((r as any)?.data ?? [])) as any[]
        setServiciosCfg(list.filter((x) => String(x.servicioCodigo).toUpperCase() !== 'GRUA'))
        setGruaOfrecida(list.some((x) => String(x.servicioCodigo).toUpperCase() === 'GRUA' && x.ofrece !== false))
      })
      .catch(() => undefined)
    if (grupoId) {
      rcvApi
        .gruaTarifas(proveedorIdSel)
        .then((r) => {
          if (!vivo) return
          const tarifas = (Array.isArray(r) ? r : ((r as any)?.data ?? [])) as any[]
          const t = tarifas.find((x) => String(x.grupoId).toLowerCase() === String(grupoId).toLowerCase())
          setGruaPrima(Number(t?.prima) || 0)
        })
        .catch(() => undefined)
    }
    return () => {
      vivo = false
    }
  }, [planIdx, proveedorIdSel, grupoId])

  const [cliente, setCliente] = useState<DatosCliente | null>(null)
  const [conductorTipo, setConductorTipo] = useState<'tomador' | 'otro'>('tomador')
  const [conductor, setConductor] = useState({ tipoDoc: 'V', cedula: '', nombres: '', apellidos: '', telefono: '' })
  const setCond = (k: keyof typeof conductor, v: string) => setConductor((c) => ({ ...c, [k]: v }))
  const conductorListo =
    conductorTipo === 'tomador' ||
    (conductor.cedula.length >= 5 && conductor.nombres.trim().length >= 2 && conductor.apellidos.trim().length >= 2)
  // ── Formulario de pago (réplica de payment-step) ──
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('DEBITO')
  const [gatewayPago, setGatewayPago] = useState('PLAZA')
  const [bancoPago, setBancoPago] = useState('') // código del banco emisor
  const [telefonoPago, setTelefonoPago] = useState('') // teléfono afiliado / emisor
  const [tipoDocTitular, setTipoDocTitular] = useState('V')
  const [cedulaTitular, setCedulaTitular] = useState('')
  const [confirmaTelefono, setConfirmaTelefono] = useState(false)
  const [descuentoOn, setDescuentoOn] = useState(false)
  const [descuentoMonto, setDescuentoMonto] = useState('')
  const [otpInput, setOtpInput] = useState('')
  const { avisar } = useToast()
  const { user } = useAuth()
  const pago = useEmisionPago()

  /** Arma el objeto de venta que consume la orquestación de pago. */
  const construirSaleData = useCallback(
    (): SaleDataVenta => ({
      tipo: tipo === 'funerario' ? 'funerario' : 'rcv',
      user,
      productoId,
      grupoId,
      selectedProviderName: productos.find((p) => p.productoId === productoId)?.nombre,
      // proveedorId ya resuelto en la cotización (cruza producto.proveedor.id) — el que
      // define la secuencia del Nº de póliza; NO re-resolver por nombre en el finalize.
      proveedorId:
        proveedores.find((p) => p.id === producto?.proveedor?.id)?.proveedorId ?? producto?.proveedor?.proveedorId ?? undefined,
      proveedores,
      plan: planes[planIdx ?? 0],
      cliente: cliente as DatosCliente,
      conductorTipo,
      conductorDatos:
        conductorTipo === 'otro'
          ? { tipoDoc: conductor.tipoDoc, cedula: conductor.cedula, nombres: conductor.nombres, apellidos: conductor.apellidos, telefono: conductor.telefono }
          : undefined,
      apovOn,
      apov,
      puestos: Number(puestos) || 5,
      gruaOn: gruaOn && gruaOfrecida,
      valorAsistencia:
        asistenciaOn ? Number(serviciosCfg.find((x) => String(x.servicioCodigo).toUpperCase() === 'ASISTENCIA')?.prima) || 0 : 0,
      valorGruaAdicional: gruaOn && gruaOfrecida ? gruaPrima : 0,
      planFun: planFunSel,
      planTipoFun,
      beneficiarios: Number(beneficiarios) || 1,
    }),
    [tipo, user, productoId, grupoId, productos, proveedores, planes, planIdx, cliente, conductorTipo, conductor, apovOn, apov, puestos, gruaOn, gruaOfrecida, gruaPrima, asistenciaOn, serviciosCfg, planFunSel, planTipoFun, beneficiarios],
  )

  // Al entrar al paso de pago, carga tasas/bancos/gateways y el total con comisión.
  useEffect(() => {
    if (paso === 3) void pago.cargarInicial(construirSaleData())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso])

  const detallesBanco = useCallback(
    (): DetallesBanco => ({
      banco: bancoPago,
      telefonoAsociado: telefonoPago,
      // Cédula del titular SIN guion (igual que la web: tipoDocumento + numeroDocumento).
      cedulaTitular: `${tipoDocTitular}${cedulaTitular}`,
      telefonoPago,
    }),
    [bancoPago, telefonoPago, tipoDocTitular, cedulaTitular],
  )

  /** Envía la orden (paso "Ingresa Datos"). */
  const enviarPago = useCallback(() => {
    const accion = () =>
      void pago.crearOrden(construirSaleData(), {
        metodo: metodoPago,
        gateway: gatewayPago,
        bank: detallesBanco(),
        descuento: descuentoOn ? Number(descuentoMonto) || 0 : 0,
      })
    // El débito pide OTP luego; el pago móvil crea la orden y espera el pago.
    accion()
  }, [pago, construirSaleData, metodoPago, gatewayPago, detallesBanco, descuentoOn, descuentoMonto])

  /** Reinicia el asistente para una nueva venta (tras emitir con éxito). */
  const reiniciar = useCallback(() => {
    setPaso(0)
    setTipo(null)
    setProductoId(null)
    setClaseId(null)
    setGrupoId(null)
    setGrupos([])
    setRiesgos({})
    setPlanes([])
    setPlanIdx(null)
    setPlanesFun([])
    setPlanFunIdx(null)
    setPuestos('5')
    setApovOn(false)
    setApov(null)
    setGruaOn(false)
    setAsistenciaOn(false)
    setCliente(null)
    setConductorTipo('tomador')
    setConductor({ tipoDoc: 'V', cedula: '', nombres: '', apellidos: '', telefono: '' })
    setTelefonoPago('')
    setBancoPago('')
    setCedulaTitular('')
    setConfirmaTelefono(false)
    setMetodoPago('DEBITO')
    setDescuentoOn(false)
    setDescuentoMonto('')
    setOtpInput('')
    setError(null)
    pago.resetToIdle()
  }, [pago])

  // Aseguradoras (productos RCV) + clases al elegir RCV.
  useEffect(() => {
    if (tipo !== 'rcv') return
    setCarga('prod', true)
    Promise.all([
      rcvApi.productos().catch(() => []),
      rcvApi.clases().catch(() => []),
      rcvApi.proveedores().catch(() => []),
    ])
      .then(([prods, cls, provs]) => {
        setProductos((prods ?? []).filter((p) => /RCV/i.test(p.nombre)))
        setClases(cls ?? [])
        setProveedores(provs ?? [])
      })
      .finally(() => setCarga('prod', false))
  }, [tipo])

  const elegirClase = useCallback((id: string) => {
    setClaseId(id)
    setGrupoId(null)
    setGrupos([])
    setPlanes([])
    setPlanIdx(null)
    setCarga('grupos', true)
    rcvApi
      .gruposPorClase(id)
      .then((r) => setGrupos((Array.isArray(r) ? r : r.data) ?? []))
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCarga('grupos', false))
  }, [])

  const producto = useMemo(() => productos.find((p) => p.productoId === productoId), [productos, productoId])

  const cotizar = useCallback(async () => {
    if (!grupoId || !producto) return
    setCarga('planes', true)
    setError(null)
    setPlanes([])
    setPlanIdx(null)
    try {
      // El proveedorId (UUID) se resuelve cruzando producto.proveedor.id contra
      // la lista de proveedores (en el producto viene null), como en la web.
      const prov =
        proveedores.find((p) => p.id === producto.proveedor?.id)?.proveedorId ??
        producto.proveedor?.proveedorId ??
        ''
      if (!prov) {
        setError('No se pudo resolver la aseguradora. Reintenta.')
        return
      }
      const r = await rcvApi.planes(grupoId, producto.productoId, prov)
      const data = Array.isArray(r) ? r : (r?.data ?? [])
      setPlanes(data)
      if (data.length === 0) setError('No se obtuvieron planes para esta combinación.')
    } catch (e) {
      if (e instanceof ApiException && e.status === 401) {
        setError('Tu sesión no está autorizada para cotizar. Vuelve a iniciar sesión.')
      } else {
        setError(mensajeDeError(e))
      }
    } finally {
      setCarga('planes', false)
    }
  }, [grupoId, producto, proveedores])

  const puedeCotizar = !!productoId && !!claseId && !!grupoId
  // Al elegir el grupo, sube para mostrar "Cotizar Planes"; al cargar los planes,
  // sube para mostrar los planes + adicionales (APOV/grúa).
  useEffect(() => {
    if (grupoId && planes.length === 0) {
      const t = setTimeout(() => desplazarA(refCotizar), 320)
      return () => clearTimeout(t)
    }
  }, [grupoId, planes.length, desplazarA])
  useEffect(() => {
    if (planes.length > 0) {
      const t = setTimeout(() => desplazarA(refPlanes), 320)
      return () => clearTimeout(t)
    }
  }, [planes.length, desplazarA])

  // El flujo funerario no tiene paso "Conductor": mostramos 3 pasos y mapeamos
  // el índice visible (paso 3 = Pago → posición 2 en el stepper funerario).
  const esFunerario = tipo === 'funerario'
  const pasosVisibles = esFunerario ? ['Cotización', 'Datos del Cliente', 'Registro de Pago'] : PASOS
  const pasoVisibleIdx = esFunerario && paso === 3 ? 2 : paso

  // Adicionales del paso de cotización (base × tasa BCV + APOV + asistencia + grúa).
  const planSelRcv = planIdx !== null ? planes[planIdx] : null
  const simboloPlan = planSelRcv?.simbolo || 'EUR'
  const ratePlan = tasa[simboloPlan as 'EUR' | 'USD'] || tasa.EUR || 0
  const asistCfg = serviciosCfg.find((x) => String(x.servicioCodigo).toUpperCase() === 'ASISTENCIA')
  const asistPrima = asistCfg ? Number(asistCfg.prima) || 0 : 0
  const baseBsRcv = (() => {
    const b = bsDePlan(planSelRcv)
    if (b > 0) return b
    const tcr = planSelRcv?.primaAnualTCR ?? planSelRcv?.finalPrice ?? planSelRcv?.prima ?? 0
    return typeof tcr === 'number' ? tcr * ratePlan : 0
  })()
  const apovBs = apovOn && apov ? (apov.primaFinalTotal ?? 0) : 0
  const asistBs = asistenciaOn && asistCfg ? asistPrima * ratePlan : 0
  const gruaBs = gruaOn && gruaOfrecida ? gruaPrima * ratePlan : 0
  const totalAdicRcv = baseBsRcv + apovBs + asistBs + gruaBs

  // Totales para el paso de pago (base × tasa BCV + APOV, como la web).
  const sdActual = construirSaleData()
  const totalesActual = calcularTotales(sdActual, pago.rates)
  const totalSinDescuento = pago.calculatedTotal ?? totalesActual.totalFull
  // Descuento manual: se resta del total EN VIVO y se valida contra el máximo (como la web).
  const descuentoNum = descuentoOn ? Math.max(0, Number(descuentoMonto) || 0) : 0
  const descuentoExcede = descuentoNum > pago.maxDiscount
  const descuentoAplicado = Math.min(descuentoNum, pago.maxDiscount)
  const totalPagarMostrar = Math.max(0, totalSinDescuento - descuentoAplicado)
  // Posición en el sub-stepper del pago según el estado y el método.
  const pagoStepIdx = (() => {
    const st = pago.otpState
    if (st === 'verified') return 2
    if (metodoPago === 'PAGO_MOVIL') return st === 'awaitingPayment' || st === 'pollingFailed' ? 1 : 0
    return st === 'idle' || st === 'sending' ? 0 : 1
  })()
  const bancosOpc: OpcionDrop[] = pago.bancos.length
    ? pago.bancos.map((b) => ({ valor: b.codigo, texto: `${b.codigo} — ${b.nombre}` }))
    : BANCOS
  const pagoDatosInvalidos =
    metodoPago === 'PAGO_MOVIL'
      ? telefonoPago.length < 7 || !confirmaTelefono
      : !bancoPago || cedulaTitular.length < 6 || telefonoPago.length < 7
  const pagoMax = pago.otpState === 'awaitingPayment' ? PM_ESPERA_S : DEBITO_ESPERA_S
  const pagoPct = Math.max(0, Math.min(100, ((pagoMax - pago.countdown) / pagoMax) * 100))

  return (
    <View style={{ flex: 1, backgroundColor: color.bgApp }}>
      {/* Stepper */}
      <View style={est.stepper}>
        {pasosVisibles.map((p, i) => {
          const activo = i === pasoVisibleIdx
          const hecho = i < pasoVisibleIdx
          return (
            <View key={p} style={est.stepItem}>
              <View style={[est.stepNum, activo && est.stepNumActivo, hecho && est.stepNumHecho]}>
                <Text style={[est.stepNumTexto, (activo || hecho) && { color: '#fff' }]}>{hecho ? '✓' : i + 1}</Text>
              </View>
              <Text style={[est.stepLabel, activo && { color: color.primaryDark, fontWeight: '800' }]} numberOfLines={1}>
                {p}
              </Text>
            </View>
          )
        })}
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y
        }}
      >
        <Text style={est.titulo}>{express ? 'Venta Rápida RCV' : 'Nueva Solicitud'}</Text>

        {error ? (
          <View style={{ marginBottom: 12 }}>
            <Alerta tipo="error">{error}</Alerta>
          </View>
        ) : null}

        {paso === 0 ? (
          <>
            {/* 1. Tipo de seguro */}
            <Text style={est.seccion}>1. ¿Qué tipo de seguro deseas cotizar?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={est.cards}>
              {TIPOS.map((t, i) => {
                const sel = t.activo && tipo === t.valor
                return (
                  <Pressable
                    key={i}
                    disabled={!t.activo}
                    onPress={() => {
                      setTipo(t.valor)
                      setProductoId(null)
                      setClaseId(null)
                      setGrupoId(null)
                    }}
                    style={[est.card, sel && est.cardSel, !t.activo && est.cardOff]}
                  >
                    {!t.activo ? (
                      <View style={est.proxBadge}>
                        <Text style={est.proxTexto}>Próximamente</Text>
                      </View>
                    ) : null}
                    <Text style={est.cardEmoji}>{t.emoji}</Text>
                    <Text style={[est.cardTexto, sel && { color: color.primary }, !t.activo && { color: color.text4 }]}>{t.texto}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            {tipo === 'rcv' ? (
              <>
                {/* 2. Aseguradora */}
                <Text style={est.seccion}>2. Selecciona la aseguradora</Text>
                {cargando.prod ? (
                  <Tarjeta style={{ padding: 18 }}>
                    <Text style={est.hint}>Cargando aseguradoras…</Text>
                  </Tarjeta>
                ) : (
                  <View style={est.grid2}>
                    {productos.map((p) => {
                      const sel = p.productoId === productoId
                      return (
                        <Pressable key={p.productoId} onPress={() => setProductoId(p.productoId)} style={est.col2}>
                          <Tarjeta style={[est.aseg, sel && est.asegSel]}>
                            <LogoAseg nombre={p.nombre} alto={30} />
                            <Text style={[est.asegTexto, { marginTop: 8 }, sel && { color: color.primary }]}>{p.nombre}</Text>
                          </Tarjeta>
                        </Pressable>
                      )
                    })}
                  </View>
                )}

                {/* 3. Datos para la cotización */}
                {productoId ? (
                  <>
                    <Text style={est.seccion}>3. Completa los datos para la cotización</Text>
                    <Tarjeta style={{ padding: 16, gap: 14 }}>
                      <Dropdown
                        etiqueta="Clase de Vehículo"
                        placeholder="Seleccione una clase"
                        opciones={aOpc(clases, (c) => c.id, (c) => c.nombre)}
                        valor={claseId}
                        onCambiar={elegirClase}
                      />
                      <Dropdown
                        etiqueta="Grupo de Vehículo"
                        placeholder="Seleccione un grupo"
                        opciones={aOpc(grupos, (g) => g.id, (g) => g.descripcion)}
                        valor={grupoId}
                        onCambiar={setGrupoId}
                        cargando={cargando.grupos}
                        deshabilitado={!claseId}
                      />
                    </Tarjeta>

                    {/* Info adicional de riesgo (colapsable) */}
                    <Pressable onPress={() => setRiesgosAbierto((v) => !v)} style={est.riesgoHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={est.riesgoHeaderTit}>Información Adicional de Riesgo</Text>
                        <Text style={est.hint}>Opcional — toca para ajustar el precio según el riesgo.</Text>
                      </View>
                      <Text style={est.chevron}>{riesgosAbierto ? '▴' : '▾'}</Text>
                    </Pressable>
                    {riesgosAbierto ? (
                      <View style={{ gap: 10, marginTop: 10 }}>
                        {RIESGOS.map((r) => (
                          <Tarjeta key={r.id} style={est.riesgo}>
                            <Text style={est.riesgoTexto}>{r.texto}</Text>
                            <Switch
                              value={!!riesgos[r.id]}
                              onValueChange={(v) => setRiesgos((s) => ({ ...s, [r.id]: v }))}
                              trackColor={{ true: color.primary, false: '#CBD5E1' }}
                              thumbColor="#fff"
                            />
                          </Tarjeta>
                        ))}
                      </View>
                    ) : null}

                    <View ref={refCotizar} collapsable={false} />
                    <Boton
                      texto={cargando.planes ? 'Cotizando…' : 'Cotizar Planes'}
                      onPress={cotizar}
                      cargando={cargando.planes}
                      disabled={!puedeCotizar}
                      style={{ marginTop: 16 }}
                    />

                    {/* 4. Planes */}
                    {planes.length > 0 ? (
                      <>
                        <View ref={refPlanes} collapsable={false} />
                        <Text style={est.seccion}>4. Selecciona el plan ideal para tu cliente</Text>
                        <View style={est.grid2}>
                          {planes.map((pl, i) => (
                            <View key={i} style={est.col2}>
                              <PlanCard plan={pl} activo={i === planIdx} onPress={() => setPlanIdx(i)} providerName={producto?.nombre} />
                            </View>
                          ))}
                        </View>

                        {/* Configura los adicionales (APOV / Grúa) */}
                        {planIdx !== null ? (
                          <>
                            <Text style={est.seccion}>Configura los adicionales</Text>
                            <Campo
                              etiqueta="Cantidad de puestos del vehículo"
                              placeholder="Ej. 5"
                              keyboardType="number-pad"
                              value={puestos}
                              onChangeText={(t) => setPuestos(t.replace(/[^0-9]/g, ''))}
                            />
                            <Tarjeta style={{ padding: 16, marginTop: 10 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={est.adTitulo}>🛡️ Servicio Adicional: APOV</Text>
                                  <Text style={est.hint}>Responsabilidad Civil para Ocupantes (RCV Ocupantes).</Text>
                                </View>
                                <Switch value={apovOn} onValueChange={setApovOn} trackColor={{ true: color.primary, false: '#CBD5E1' }} thumbColor="#fff" />
                              </View>
                              {apovOn ? (
                                apovCargando ? (
                                  <Text style={[est.hint, { marginTop: 10 }]}>Calculando APOV…</Text>
                                ) : apov ? (
                                  <View style={est.apovBox}>
                                    {[
                                      ['Muerte Accidental', apov.muerteTotal],
                                      ['Invalidez Permanente', apov.invalidezTotal],
                                      ['Gastos Médicos', apov.gastosMedicosTotal],
                                      ['Gastos de Entierro', apov.servicioFunerariosTotal],
                                    ]
                                      .filter(([, v]) => typeof v === 'number' && v > 0)
                                      .map(([k, v]) => (
                                        <View key={String(k)} style={est.apovFila}>
                                          <Text style={est.apovK}>{k}</Text>
                                          <Text style={est.apovV}>{moneda(v as number, 'Bs.')}</Text>
                                        </View>
                                      ))}
                                    <View style={[est.apovFila, est.apovTotalFila]}>
                                      <Text style={est.apovTotalK}>Prima APOV Total</Text>
                                      <Text style={est.apovTotalV}>{moneda(apov.primaFinalTotal ?? 0, 'Bs.')}</Text>
                                    </View>
                                  </View>
                                ) : (
                                  <Text style={[est.hint, { marginTop: 10 }]}>No se pudo calcular el APOV.</Text>
                                )
                              ) : null}
                            </Tarjeta>

                            {/* Asistencia en Viajes (si la aseguradora la ofrece) */}
                            {asistCfg ? (
                              <Tarjeta style={{ padding: 16, marginTop: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={est.adTitulo}>🛠️ {asistCfg.labelCobertura || 'Asistencia en Viajes'}</Text>
                                    <Text style={est.hint}>Prima fija: {numero(asistPrima)} {simboloPlan}</Text>
                                  </View>
                                  <Switch value={asistenciaOn} onValueChange={setAsistenciaOn} trackColor={{ true: color.primary, false: '#CBD5E1' }} thumbColor="#fff" />
                                </View>
                              </Tarjeta>
                            ) : null}

                            {/* Grúa (solo si el proveedor la ofrece por grupo; Caroní no) */}
                            {gruaOfrecida && gruaPrima > 0 ? (
                              <Tarjeta style={{ padding: 16, marginTop: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={est.adTitulo}>🚚 Grúa</Text>
                                    <Text style={est.hint}>Prima fija: {numero(gruaPrima)} {simboloPlan}</Text>
                                  </View>
                                  <Switch value={gruaOn} onValueChange={setGruaOn} trackColor={{ true: color.primary, false: '#CBD5E1' }} thumbColor="#fff" />
                                </View>
                              </Tarjeta>
                            ) : null}

                            {/* Total estimado */}
                            <Tarjeta style={est.totalEstimado}>
                              <FilaResumen k={`Plan (${planes[planIdx]?.grupo?.descripcion ?? 'RCV'})`} v={moneda(baseBsRcv, 'Bs.')} />
                              {apovBs > 0 ? <FilaResumen k="+ APOV" v={moneda(apovBs, 'Bs.')} /> : null}
                              {asistBs > 0 ? <FilaResumen k="+ Asistencia" v={moneda(asistBs, 'Bs.')} /> : null}
                              {gruaBs > 0 ? <FilaResumen k="+ Grúa" v={moneda(gruaBs, 'Bs.')} /> : null}
                              <View style={est.totalDivider} />
                              <View style={est.apovFila}>
                                <Text style={est.totalEstK}>Total estimado</Text>
                                <Text style={est.totalEstV}>{moneda(totalAdicRcv, 'Bs.')}</Text>
                              </View>
                            </Tarjeta>
                          </>
                        ) : null}

                        <Boton
                          texto="Continuar — Datos del Cliente"
                          onPress={() => setPaso(1)}
                          disabled={planIdx === null}
                          style={{ marginTop: 16 }}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : tipo === 'funerario' ? (
              <>
                <Text style={est.seccion}>2. Configura el plan funerario</Text>
                <Tarjeta style={{ padding: 16, gap: 14 }}>
                  {/* Tipo de plan */}
                  <View>
                    <Text style={est.label}>Tipo de Plan Funerario</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {([['individual', '👤 Individual'], ['familiar', '👪 Familiar']] as const).map(([v, t]) => (
                        <Pressable
                          key={v}
                          onPress={() => {
                            setPlanTipoFun(v)
                            if (v === 'individual') setBeneficiarios('1')
                          }}
                          style={[est.metodoBtn, planTipoFun === v && est.metodoBtnOn]}
                        >
                          <Text style={{ fontSize: 12.5, fontWeight: '800', color: planTipoFun === v ? '#fff' : color.text2 }}>{t}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* Cantidad de asegurados (solo individual) */}
                  {planTipoFun === 'individual' ? (
                    <Campo
                      etiqueta="Cantidad de asegurados (1 a 5)"
                      placeholder="1"
                      keyboardType="number-pad"
                      value={beneficiarios}
                      onChangeText={(t) => {
                        const n = Math.min(5, Math.max(1, Number(t.replace(/[^0-9]/g, '')) || 1))
                        setBeneficiarios(String(n))
                      }}
                    />
                  ) : (
                    <Alerta tipo="info">El Plan Familiar cubre al grupo familiar con una prima única de grupo.</Alerta>
                  )}

                  {/* Rango de edad */}
                  <View>
                    <Text style={est.label}>Rango de edad del asegurado</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {([['under65', 'Hasta 65 años'], ['over65', '66 años o más']] as const).map(([v, t]) => (
                        <Pressable key={v} onPress={() => setRangoEdad(v)} style={[est.metodoBtn, rangoEdad === v && est.metodoBtnOn]}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: rangoEdad === v ? '#fff' : color.text2 }}>{t}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <Boton
                    texto={cotizandoFun ? 'Buscando…' : 'Cotizar Planes Funerarios'}
                    onPress={cotizarFun}
                    cargando={cotizandoFun}
                    style={{ marginTop: 4 }}
                  />
                </Tarjeta>

                {/* Planes funerarios */}
                {planesFun.length > 0 ? (
                  <>
                    <Text style={est.seccion}>3. Selecciona el plan</Text>
                    <View style={{ gap: 12 }}>
                      {planesFun.map((p, i) => {
                        const familiar = planTipoFun === 'familiar'
                        const cuenta = Math.max(1, Number(beneficiarios) || 1)
                        const precio = familiar ? p.primaAnualGrupo : p.primaAnualSeg * cuenta
                        const activo = i === planFunIdx
                        return (
                          <Pressable key={p.id} onPress={() => setPlanFunIdx(i)}>
                            <Tarjeta style={[{ padding: 16 }, activo && { borderColor: color.primary, borderWidth: 2 }]}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={est.planTitulo}>Suma Asegurada: ${numero(p.sumaAsegurada)}</Text>
                                {activo ? <Pildora color={color.primary} texto="Seleccionado" /> : null}
                              </View>
                              <Text style={[est.covNombre, { marginTop: 4 }]}>Cobertura: {p.cobertura}</Text>
                              <Text style={[est.hint, { marginTop: 2 }]}>
                                Edades {p.escalaEdad.desde}
                                {p.escalaEdad.hasta ? `–${p.escalaEdad.hasta}` : '+'} años
                                {familiar ? '' : ` · ${cuenta} asegurado${cuenta > 1 ? 's' : ''}`}
                              </Text>
                              <Text style={est.planPrima}>
                                ${numero(precio)} <Text style={est.planPrimaSub}>USD / Anual</Text>
                              </Text>
                            </Tarjeta>
                          </Pressable>
                        )
                      })}
                    </View>

                    <Boton
                      texto="Continuar — Datos del Cliente"
                      onPress={() => setPaso(1)}
                      disabled={planFunIdx === null}
                      style={{ marginTop: 16 }}
                    />
                  </>
                ) : null}
              </>
            ) : (
              <View style={{ marginTop: 8 }}>
                <Alerta tipo="info">Elige un tipo de seguro para empezar la cotización.</Alerta>
              </View>
            )}
          </>
        ) : paso === 1 ? (
          // ── Paso 2 · Datos del Cliente ─────────────────────────
          <PasoCliente
            scrollRef={scrollRef}
            mostrarVehiculo={!esFunerario}
            express={express}
            onAtras={() => setPaso(0)}
            onContinuar={(d) => {
              setCliente(d)
              // Funerario no lleva paso de conductor: va directo a pago.
              setPaso(esFunerario ? 3 : 2)
            }}
          />
        ) : paso === 2 ? (
          // ── Paso 3 · Conductor Frecuente ───────────────────────
          <Tarjeta style={{ padding: 18, gap: 12 }}>
            <Text style={est.pasoTitulo}>Conductor Frecuente</Text>
            <Text style={est.hint}>Define quién será el conductor principal del vehículo.</Text>
            {(
              [
                ['tomador', `${cliente?.nombres ?? ''} ${cliente?.apellidos ?? ''}`.trim() + ' (Tomador)'],
                ['otro', 'Otra Persona'],
              ] as const
            ).map(([v, label]) => {
              const sel = conductorTipo === v
              return (
                <Pressable key={v} onPress={() => setConductorTipo(v)} style={[est.radioFila, sel && est.radioFilaOn]}>
                  <View style={[est.radio, sel && { borderColor: color.primary }]}>
                    {sel ? <View style={est.radioDot} /> : null}
                  </View>
                  <Text style={{ fontSize: 13.5, fontWeight: sel ? '800' : '600', color: sel ? color.primaryDark : color.text, flex: 1 }}>
                    {label}
                  </Text>
                </Pressable>
              )
            })}
            {conductorTipo === 'otro' ? (
              <View style={{ gap: 12, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ width: 96 }}>
                    <Dropdown
                      etiqueta="Tipo"
                      opciones={[
                        { valor: 'V', texto: 'V' },
                        { valor: 'E', texto: 'E' },
                        { valor: 'P', texto: 'P' },
                      ]}
                      valor={conductor.tipoDoc}
                      onCambiar={(v) => setCond('tipoDoc', v)}
                    />
                  </View>
                  <Campo
                    etiqueta="Cédula"
                    placeholder="12345678"
                    keyboardType="number-pad"
                    value={conductor.cedula}
                    onChangeText={(t) => setCond('cedula', t.replace(/[^0-9]/g, ''))}
                    style={{ flex: 1 }}
                  />
                </View>
                <Campo etiqueta="Nombres" placeholder="Nombres" value={conductor.nombres} onChangeText={(t) => setCond('nombres', t)} />
                <Campo etiqueta="Apellidos" placeholder="Apellidos" value={conductor.apellidos} onChangeText={(t) => setCond('apellidos', t)} />
                <Campo
                  etiqueta="Teléfono (opcional)"
                  placeholder="04141234567"
                  keyboardType="phone-pad"
                  value={conductor.telefono}
                  onChangeText={(t) => setCond('telefono', t.replace(/[^0-9]/g, ''))}
                />
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <Boton texto="← Atrás" variante="soft" onPress={() => setPaso(1)} style={{ flex: 1 }} />
              <Boton texto="Siguiente Paso" onPress={() => setPaso(3)} disabled={!conductorListo} style={{ flex: 1.4 }} />
            </View>
          </Tarjeta>
        ) : pago.otpState === 'verified' ? (
          // ── Pago · Éxito (ID de transacción + descargas) ───────
          <PagoExito emision={pago.emision} cliente={cliente} onNuevo={reiniciar} />
        ) : (
          // ── Paso 4 · Registro del Pago (dirigido por otpState, réplica de payment-step) ──
          <View style={{ gap: 12 }}>
            {/* Sub-stepper del pago (difiere por método, como la web) */}
            <View style={est.pagoSteps}>
              {(metodoPago === 'PAGO_MOVIL'
                ? ['Confirma Datos', 'Paga', 'Listo']
                : ['Ingresa Datos', 'Recibe SMS', 'Confirma']
              ).map((s, i) => {
                const activo = i === pagoStepIdx
                const hecho = i < pagoStepIdx
                return (
                  <View key={s} style={est.pagoStepItem}>
                    <View style={[est.pagoDot, activo && est.pagoDotOn, hecho && est.pagoDotHecho]}>
                      <Text style={[est.pagoDotTxt, (activo || hecho) && { color: '#fff' }]}>{hecho ? '✓' : i + 1}</Text>
                    </View>
                    <Text style={[est.pagoStepLabel, activo && { color: color.primaryDark, fontWeight: '800' }]} numberOfLines={1}>
                      {s}
                    </Text>
                  </View>
                )
              })}
            </View>

            {pago.ratesLoadError ? (
              <Alerta tipo="error">Tasas de cambio no disponibles. No es posible procesar el pago en este momento.</Alerta>
            ) : null}
            {pago.otpError && pago.otpState === 'idle' ? <Alerta tipo="error">{pago.otpError}</Alerta> : null}

            {pago.otpState === 'idle' || pago.otpState === 'sending' ? (
              // ── Ingresa Datos ──────────────────────────────────
              <>
                <Tarjeta style={{ padding: 16 }}>
                  <Text style={est.pasoTitulo}>Registro del Pago</Text>
                  <View style={est.resumenBox}>
                    <FilaResumen k="Aseguradora" v={esFunerario ? 'Servicio Funerario' : (producto?.nombre ?? '—')} />
                    <FilaResumen
                      k="Plan"
                      v={
                        esFunerario
                          ? `Suma $${numero(planFunSel?.sumaAsegurada ?? 0)}`
                          : (planes[planIdx ?? 0]?.grupo?.descripcion ?? planes[planIdx ?? 0]?.descripcion ?? 'Plan RCV')
                      }
                    />
                    <FilaResumen k="Tomador" v={`${cliente?.nombres ?? ''} ${cliente?.apellidos ?? ''}`.trim() || '—'} />
                    <FilaResumen k="Documento" v={`${cliente?.tipoDoc ?? ''}-${cliente?.cedula ?? ''}`} />
                  </View>
                </Tarjeta>

                {/* Desglose de montos (base × tasa BCV + APOV) */}
                <Tarjeta style={{ padding: 16, gap: 6 }}>
                  {pago.cargandoInicial ? <Text style={est.hint}>Calculando montos con la tasa BCV…</Text> : null}
                  <FilaResumen
                    k={esFunerario ? `Monto Base (Ref. $${numero(totalesActual.baseForeign)})` : `Monto Base (Ref. ${numero(totalesActual.baseForeign)} ${totalesActual.moneda})`}
                    v={moneda(totalesActual.totalRCV_VES, 'Bs.')}
                  />
                  {totalesActual.totalAdicional_VES > 0 ? (
                    <FilaResumen k="🛡️ Servicio APOV" v={`+ ${moneda(totalesActual.totalAdicional_VES, 'Bs.')}`} />
                  ) : null}
                  {!user?.comisionPrepagada && pago.maxDiscount > 0 ? (
                    <>
                      <Pressable onPress={() => setDescuentoOn((v) => !v)} style={est.descuentoFila}>
                        <View style={[est.checkBox, descuentoOn && est.checkOn]}>
                          {descuentoOn ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>✓</Text> : null}
                        </View>
                        <Text style={{ fontSize: 12.5, color: color.text2, flex: 1 }}>
                          Aplicar Descuento (Máx: {moneda(pago.maxDiscount, 'Bs.')})
                        </Text>
                      </Pressable>
                      {descuentoOn ? (
                        <>
                          <Campo
                            etiqueta="Monto del Descuento (Bs.)"
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            value={descuentoMonto}
                            error={descuentoExcede}
                            onChangeText={(t) => setDescuentoMonto(t.replace(/[^0-9.]/g, ''))}
                          />
                          {descuentoExcede ? (
                            <Text style={{ fontSize: 11.5, color: color.danger, fontWeight: '700' }}>
                              El descuento excede el máximo permitido ({moneda(pago.maxDiscount, 'Bs.')}).
                            </Text>
                          ) : (
                            <Text style={est.hint}>Se descuenta de tu comisión asignada.</Text>
                          )}
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {descuentoAplicado > 0 ? (
                    <FilaResumen k="🏷️ Descuento Manual" v={`- ${moneda(descuentoAplicado, 'Bs.')}`} />
                  ) : null}
                  <View style={est.totalDivider} />
                  <View style={est.apovFila}>
                    <Text style={est.totalEstK}>Total a {metodoPago === 'PAGO_MOVIL' ? 'Pagar' : 'Debitar'}</Text>
                    <Text style={est.totalEstV}>{moneda(totalPagarMostrar, 'Bs.')}</Text>
                  </View>
                  {!MONTO_REAL ? (
                    <Text style={[est.hint, { textAlign: 'right' }]}>En QA se cobra {moneda(1, 'Bs.')} (modo prueba).</Text>
                  ) : null}
                </Tarjeta>

                {/* Método de pago (Pago Móvil solo si el BFF lo habilita) */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {([['DEBITO', '🏦 Débito Inmediato'] as const, ...(pago.pagoMovilHabilitado ? [['PAGO_MOVIL', '📲 Pago Móvil'] as const] : [])]).map(
                    ([m, t]) => (
                      <Pressable key={m} onPress={() => setMetodoPago(m)} style={[est.metodoBtn, metodoPago === m && est.metodoBtnOn]}>
                        <Text style={{ fontSize: 12.5, fontWeight: '800', color: metodoPago === m ? '#fff' : color.text2 }}>{t}</Text>
                      </Pressable>
                    ),
                  )}
                </View>

                <Tarjeta style={{ padding: 18, gap: 14 }}>
                  {metodoPago === 'PAGO_MOVIL' ? (
                    <>
                      <Text style={est.metodoTitulo}>Datos para el Pago Móvil</Text>
                      <Text style={est.hint}>Indícanos desde dónde realizarás el pago móvil para poder identificarlo.</Text>
                      <Campo
                        etiqueta="Número de Teléfono Emisor"
                        placeholder="04141234567"
                        keyboardType="phone-pad"
                        value={telefonoPago}
                        onChangeText={(t) => setTelefonoPago(t.replace(/[^0-9]/g, ''))}
                      />
                      <Pressable onPress={() => setConfirmaTelefono((v) => !v)} style={est.descuentoFila}>
                        <View style={[est.checkBox, confirmaTelefono && est.checkOn]}>
                          {confirmaTelefono ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>✓</Text> : null}
                        </View>
                        <Text style={{ fontSize: 12.5, color: color.text2, flex: 1 }}>
                          Confirmo que el pago móvil se realizará desde el teléfono indicado.
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <Text style={est.metodoTitulo}>Datos del Titular de la Cuenta</Text>
                        {bancoPago ? <LogoBanco codigo={bancoPago} size={40} /> : null}
                      </View>
                      {pago.gateways.length > 1 ? (
                        <View style={{ gap: 8 }}>
                          <Text style={est.label}>Plataforma de cobro</Text>
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            {pago.gateways.map((g) => {
                              const logoG = logoGateway(g)
                              const selG = gatewayPago === g.id
                              return (
                                <Pressable
                                  key={g.id}
                                  onPress={() => setGatewayPago(g.id)}
                                  style={[est.metodoBtn, selG && est.metodoBtnOn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
                                >
                                  {logoG ? (
                                    <View style={{ backgroundColor: '#fff', borderRadius: 4, paddingHorizontal: 3, paddingVertical: 2 }}>
                                      <Image source={logoG} resizeMode="contain" style={{ width: 30, height: 15 }} />
                                    </View>
                                  ) : null}
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: selG ? '#fff' : color.text2 }}>{g.nombre}</Text>
                                </Pressable>
                              )
                            })}
                          </View>
                        </View>
                      ) : null}
                      <Dropdown
                        etiqueta="Banco Emisor"
                        placeholder="Selecciona tu banco"
                        opciones={bancosOpc}
                        valor={bancoPago || null}
                        onCambiar={setBancoPago}
                        renderIcono={(o) => <LogoBanco codigo={o.valor} size={26} />}
                      />
                      <View>
                        <Text style={est.label}>Cédula del Titular</Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ width: 84 }}>
                            <Dropdown opciones={TIPOS_DOC_TITULAR} valor={tipoDocTitular} onCambiar={setTipoDocTitular} />
                          </View>
                          <Campo
                            placeholder="12345678"
                            keyboardType="number-pad"
                            value={cedulaTitular}
                            onChangeText={(t) => setCedulaTitular(t.replace(/[^0-9]/g, ''))}
                            style={{ flex: 1 }}
                          />
                        </View>
                      </View>
                      <Campo
                        etiqueta="Teléfono Afiliado al Banco"
                        placeholder="04141234567"
                        keyboardType="phone-pad"
                        value={telefonoPago}
                        onChangeText={(t) => setTelefonoPago(t.replace(/[^0-9]/g, ''))}
                      />
                      <Text style={est.hint}>El número donde recibes los mensajes del banco.</Text>
                    </>
                  )}
                </Tarjeta>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <Boton texto="← Atrás" variante="soft" onPress={() => setPaso(esFunerario ? 1 : 2)} disabled={pago.otpState === 'sending'} style={{ flex: 1 }} />
                  <Boton
                    texto={
                      pago.otpState === 'sending'
                        ? 'Procesando…'
                        : metodoPago === 'PAGO_MOVIL'
                          ? 'Confirmar y Ver Datos de Pago'
                          : 'Solicitar Clave Dinámica (OTP)'
                    }
                    variante="exito"
                    onPress={enviarPago}
                    cargando={pago.otpState === 'sending'}
                    disabled={pagoDatosInvalidos || descuentoExcede || pago.otpState === 'sending' || pago.ratesLoadError}
                    style={{ flex: 1.7 }}
                  />
                </View>
              </>
            ) : pago.otpState === 'sent' || pago.otpState === 'error' ? (
              // ── Recibe SMS · Verifica tu Identidad (Débito) ────
              <Tarjeta style={{ padding: 20, gap: 14 }}>
                <Text style={[est.pasoTitulo, { textAlign: 'center' }]}>Verifica tu Identidad</Text>
                {bancoPago ? (
                  <View style={{ alignItems: 'center' }}>
                    <LogoBanco codigo={bancoPago} size={58} />
                  </View>
                ) : null}
                <Text style={[est.hint, { textAlign: 'center' }]}>
                  Hemos enviado un código de verificación a tu teléfono asociado al banco. Ingrésalo a continuación:
                </Text>
                <Campo
                  etiqueta="Código (Clave Dinámica)"
                  placeholder="Ej: 123456"
                  keyboardType="number-pad"
                  value={otpInput}
                  onChangeText={(t) => setOtpInput(t.replace(/[^0-9]/g, '').slice(0, 8))}
                  style={{ marginTop: 4 }}
                />
                {pago.otpState === 'error' && pago.otpError ? <Alerta tipo="error">❌ {pago.otpError}</Alerta> : null}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <Boton
                    texto={pago.otpState === 'error' ? '⬅ Volver e Intentar Nuevamente' : 'Cambiar Banco / Cancelar'}
                    variante="soft"
                    onPress={() => {
                      setOtpInput('')
                      pago.resetToIdle()
                    }}
                    style={{ flex: 1 }}
                  />
                  {pago.otpState !== 'error' ? (
                    <Boton
                      texto="Confirmar Débito"
                      variante="exito"
                      onPress={() => void pago.confirmarOtp(construirSaleData(), otpInput)}
                      disabled={otpInput.length < 6}
                      style={{ flex: 1.2 }}
                    />
                  ) : null}
                </View>
              </Tarjeta>
            ) : pago.otpState === 'verifying' ? (
              // ── Validando con el Banco ─────────────────────────
              <Tarjeta style={{ padding: 24, gap: 12, alignItems: 'center' }}>
                <Spinner size={30} />
                <Text style={est.pasoTitulo}>Validando con el Banco…</Text>
                <Text style={[est.hint, { textAlign: 'center' }]}>
                  Tu banco está procesando la solicitud. Esto suele ser rápido, pero a veces puede tomar hasta 2 minutos.
                </Text>
                <Alerta tipo="info">⚠️ Por favor, NO cierres esta pantalla. Si sales ahora, la operación podría quedar en el limbo.</Alerta>
                <View style={est.progressBar}>
                  <View style={[est.progressFill, { width: `${pagoPct}%` }]} />
                </View>
                <Text style={est.hint}>Tiempo de espera máximo: {pago.countdown} seg</Text>
              </Tarjeta>
            ) : pago.otpState === 'pollingFailed' ? (
              // ── Recuperación (banco tardando / no detectado) ───
              <Tarjeta style={{ padding: 20, gap: 12 }}>
                <Text style={{ fontSize: 30, textAlign: 'center' }}>⏳</Text>
                <Text style={est.pasoTitulo}>{pago.otpError || 'El banco está tardando en responder'}</Text>
                <Alerta tipo="error">
                  ¡IMPORTANTE! No generes un nuevo código todavía. Es muy probable que el banco ya haya descontado el
                  dinero pero no nos ha enviado la confirmación. Si cancelas y lo haces de nuevo, podrían cobrarte dos
                  veces.
                </Alerta>
                <Boton texto="🔄 Consultar Nuevamente (Sin cobrar extra)" onPress={() => void pago.reintentar(construirSaleData())} />
                <Boton
                  texto="Cancelar operación"
                  variante="soft"
                  onPress={() => {
                    setOtpInput('')
                    pago.resetToIdle()
                  }}
                />
              </Tarjeta>
            ) : pago.otpState === 'awaitingPayment' ? (
              // ── Pago Móvil · Instrucciones R4 ──────────────────
              <Tarjeta style={{ padding: 20, gap: 14 }}>
                <Text style={{ fontSize: 30, textAlign: 'center' }}>🎫</Text>
                <Text style={est.pasoTitulo}>Orden Generada</Text>
                <Text style={est.hint}>Por favor, realiza el pago móvil con los siguientes datos:</Text>
                <View style={est.resumenBox}>
                  <FilaResumen k="Banco" v="Banco R4 (0169)" />
                  <FilaResumen k="RIF" v="J-30393487-0" />
                  <FilaResumen k="Teléfono" v="0424-497-0837" />
                  <FilaResumen k="Monto exacto" v={moneda(MONTO_REAL ? totalPagarMostrar : 1, 'Bs.')} />
                </View>
                <View style={{ alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <Spinner size={24} />
                  <Text style={[est.hint, { textAlign: 'center' }]}>
                    Esperando tu Pago Móvil… Detectaremos la confirmación automáticamente.
                  </Text>
                  <View style={est.progressBar}>
                    <View style={[est.progressFill, { width: `${pagoPct}%` }]} />
                  </View>
                  <Text style={est.hint}>Tiempo para pagar: {pago.countdown} seg</Text>
                </View>
                <Boton texto="⬅️ Cambiar Método" variante="soft" onPress={() => pago.resetToIdle()} />
              </Tarjeta>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function FilaResumen({ k, v }: { k: string; v: string }) {
  return (
    <View style={est.filaResumen}>
      <Text style={est.filaResumenK}>{k}</Text>
      <Text style={est.filaResumenV} numberOfLines={1}>
        {v}
      </Text>
    </View>
  )
}

/** Pantalla de éxito: ID de transacción + descarga de documentos (como la web). */
function PagoExito({
  emision,
  cliente,
  onNuevo,
}: {
  emision: Emision | null
  cliente: DatosCliente | null
  onNuevo: () => void
}) {
  // Animación "pop" del check al emitir (transacción exitosa).
  const escala = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(escala, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start()
    sonidoExito() // chime + vibración de transacción exitosa
  }, [escala])

  const compartirCliente = async () => {
    const c = cliente
    const nombre = [c?.nombres, c?.apellidos].filter(Boolean).join(' ')
    const lineas = [
      '🧾 BARECA — Datos del cliente',
      nombre ? `Nombre: ${nombre}` : '',
      c?.cedula ? `Documento: ${c?.tipoDoc ?? 'V'}-${c.cedula}` : '',
      c?.genero ? `Género: ${c.genero === 'F' ? 'Femenino' : 'Masculino'}` : '',
      c?.correo ? `Correo: ${c.correo}` : '',
      c?.telefono ? `Teléfono: ${c.telefono}` : '',
      c?.placa ? `Placa: ${c.placa}` : '',
      emision?.numeroPoliza ? `Póliza N°: ${emision.numeroPoliza}` : '',
      emision?.transactionId ? `ID de transacción: ${emision.transactionId}` : '',
    ].filter(Boolean)
    try {
      await Share.share({ message: lineas.join('\n') })
    } catch {
      /* el usuario canceló */
    }
  }

  const docs = [
    { etiqueta: 'Comprobante de Póliza', emoji: '📄', url: emision?.urlPoliza },
    { etiqueta: 'Carnet de RCV', emoji: '🪪', url: emision?.urlCarnetPoliza },
    { etiqueta: emision?.condicionadoTitulo ?? 'Condicionado de Póliza', emoji: '📑', url: emision?.condicionado },
  ].filter((d) => !!d.url)

  return (
    <View style={{ gap: 14 }}>
      <Tarjeta style={est.exitoCard}>
        <Animated.View style={[est.exitoIcono, { transform: [{ scale: escala }] }]}>
          <Text style={{ fontSize: 34 }}>✅</Text>
        </Animated.View>
        <Text style={est.exitoTitulo}>¡Póliza Emitida!</Text>
        <Text style={est.exitoSub}>La póliza se generó correctamente. Comparte los documentos con tu cliente.</Text>
        {emision?.numeroPoliza ? (
          <View style={est.exitoNumeroBox}>
            <Text style={est.exitoNumeroLabel}>Número de Póliza</Text>
            <Text style={est.exitoNumero}>{emision.numeroPoliza}</Text>
          </View>
        ) : null}
        {emision?.transactionId ? (
          <View style={est.exitoTxFila}>
            <Text style={est.exitoTxK}>ID de Transacción</Text>
            <Text style={est.exitoTxV} numberOfLines={1}>
              {emision.transactionId}
            </Text>
          </View>
        ) : null}
      </Tarjeta>

      {docs.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={est.seccion}>Documentos de la póliza</Text>
          {docs.map((d) => (
            <DocMini key={d.etiqueta} etiqueta={d.etiqueta} emoji={d.emoji} url={d.url as string} />
          ))}
        </View>
      ) : (
        <Alerta tipo="info">
          La póliza fue emitida. Los documentos (cuadro y carnet) estarán disponibles en “Mis Ventas” en unos
          instantes.
        </Alerta>
      )}

      <Boton texto="📤 Compartir datos del cliente" variante="soft" onPress={compartirCliente} />
      <Boton texto="Nueva venta" onPress={onNuevo} style={{ marginTop: 4 }} />
    </View>
  )
}

/** Mini vista previa de un PDF (visor de Google en Android / directo en iOS). */
function DocMini({ etiqueta, emoji, url }: { etiqueta: string; emoji: string; url: string }) {
  const [error, setError] = useState(false)
  const visor = Platform.OS === 'android' ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}` : url
  const abrir = () => Linking.openURL(url).catch(() => undefined)
  return (
    <Tarjeta style={{ padding: 0, overflow: 'hidden' }}>
      <View style={est.docMini}>
        {error ? (
          <View style={est.docMiniCentro}>
            <Text style={{ fontSize: 26 }}>{emoji}</Text>
            <Text style={est.docMiniMsg}>Vista previa no disponible — toca “Abrir”.</Text>
          </View>
        ) : (
          <WebView
            source={{ uri: visor }}
            style={{ flex: 1, backgroundColor: '#fff' }}
            startInLoadingState
            renderLoading={() => (
              <View style={est.docMiniCentro}>
                <ActivityIndicator color={color.primary} />
              </View>
            )}
            onError={() => setError(true)}
            onHttpError={() => setError(true)}
            scrollEnabled={false}
          />
        )}
        {/* Capa para abrir el documento completo al tocar la vista previa. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={abrir} />
      </View>
      <Pressable onPress={abrir} style={est.docFooter}>
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={est.docTitulo} numberOfLines={1}>
            {etiqueta}
          </Text>
          <Text style={est.docSub}>Toca para abrir / descargar</Text>
        </View>
        <Text style={est.docFlecha}>⬇</Text>
      </Pressable>
    </Tarjeta>
  )
}

/** Tarjeta de plan RCV (defensiva sobre la forma exacta del backend). */
function PlanCard({ plan, activo, onPress, providerName }: { plan: any; activo: boolean; onPress: () => void; providerName?: string }) {
  const titulo = plan?.grupo?.descripcion ?? plan?.descripcion ?? plan?._planLabel ?? 'Plan RCV'
  const tcr = plan?.primaAnualTCR ?? plan?.finalPrice ?? plan?.prima ?? null
  const coberturas: any[] = Array.isArray(plan?.coberturas) ? plan.coberturas : []
  // Servicios del plan (grúa/asistencia) — el backend los trae configurados por proveedor/grupo.
  const servicios: any[] = Array.isArray(plan?.servicios) ? plan.servicios : []
  return (
    <Pressable onPress={onPress}>
      <Tarjeta style={[{ padding: 16 }, activo && { borderColor: color.primary, borderWidth: 2 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <LogoAseg nombre={providerName} alto={22} />
          {activo ? <Pildora color={color.primary} texto="Seleccionado" /> : null}
        </View>
        <Text style={est.planTitulo}>{titulo}</Text>
        {servicios.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {servicios.map((s, i) => {
              const nombre = String(s?.nombre ?? s?.descripcion ?? 'Servicio')
              const grua = /gr[uú]a/i.test(nombre)
              const asist = /asistencia/i.test(nombre)
              return <Pildora key={i} color={color.success} texto={`${grua ? '🚚 ' : asist ? '🛠️ ' : '✔ '}${nombre}`} />
            })}
          </View>
        ) : null}
        {coberturas.slice(0, 4).map((c, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={est.covNombre}>✔ {c?.nombre ?? c?.cobertura ?? 'Cobertura'}</Text>
            <Text style={est.covVal}>{numero(c?.sumaCobertura ?? c?.sumaAsegurada)} EUR</Text>
          </View>
        ))}
        {tcr != null ? (
          <Text style={est.planPrima}>
            TCR {moneda(tcr, '')} EUR <Text style={est.planPrimaSub}>/ Anual</Text>
          </Text>
        ) : null}
      </Tarjeta>
    </Pressable>
  )
}

const est = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    backgroundColor: color.white,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  stepItem: { flex: 1, alignItems: 'center' },
  stepNum: {
    width: 28, height: 28, borderRadius: 99, backgroundColor: color.bgCard,
    borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center',
  },
  stepNumActivo: { backgroundColor: color.primary, borderColor: color.primary },
  stepNumHecho: { backgroundColor: color.success, borderColor: color.success },
  stepNumTexto: { fontSize: 12, fontWeight: '800', color: color.text3 },
  stepLabel: { fontSize: 10, color: color.text3, marginTop: 4, textAlign: 'center' },
  titulo: { fontSize: 20, fontWeight: '800', color: color.text, marginBottom: 14, letterSpacing: -0.3 },
  label: { fontSize: 12, fontWeight: '700', color: color.text2, marginBottom: 6 },
  seccion: { fontSize: 14.5, fontWeight: '800', color: color.text, marginTop: 22, marginBottom: 10 },
  hint: { fontSize: 12, color: color.text3, lineHeight: 17 },
  cards: { flexDirection: 'row', gap: 10, paddingRight: 4, paddingVertical: 2 },
  card: {
    width: 130, backgroundColor: color.white, borderWidth: 1, borderColor: color.borderSoft,
    borderRadius: 14, paddingVertical: 20, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', minHeight: 106,
  },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  col2: { width: '47%', flexGrow: 1 },
  cardSel: { borderColor: color.primary, borderWidth: 2 },
  cardOff: { opacity: 0.6 },
  cardEmoji: { fontSize: 26, marginBottom: 6 },
  cardTexto: { fontSize: 13, fontWeight: '800', color: color.text, textAlign: 'center' },
  proxBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#4B5563', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  proxTexto: { fontSize: 8.5, fontWeight: '700', color: '#fff' },
  aseg: { padding: 16, alignItems: 'center' },
  asegSel: { borderColor: color.primary, borderWidth: 2 },
  asegTexto: { fontSize: 13.5, fontWeight: '700', color: color.text, textAlign: 'center' },
  riesgo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  riesgoTexto: { flex: 1, fontSize: 12, color: color.text2, lineHeight: 17 },
  riesgoHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  riesgoHeaderTit: { fontSize: 14.5, fontWeight: '800', color: color.text },
  chevron: { fontSize: 15, fontWeight: '900', color: color.primary },
  planTitulo: { fontSize: 15, fontWeight: '800', color: color.text },
  planPrima: { fontSize: 18, fontWeight: '800', color: color.primary, marginTop: 8 },
  planPrimaSub: { fontSize: 12, fontWeight: '600', color: color.text3 },
  covNombre: { fontSize: 11.5, color: color.text2 },
  covVal: { fontSize: 11.5, color: color.text, fontWeight: '700' },
  pasoTitulo: { fontSize: 16, fontWeight: '800', color: color.text, marginBottom: 8 },
  metodoTitulo: { fontSize: 13, fontWeight: '800', color: color.primary },
  totalCard: { padding: 16, alignItems: 'center', backgroundColor: color.primaryTint, borderColor: color.primaryLight },
  totalLabel: { fontSize: 11.5, fontWeight: '700', color: color.text3, letterSpacing: 0.4 },
  totalValor: { fontSize: 26, fontWeight: '800', color: color.primaryDark, marginTop: 4, letterSpacing: -0.5 },
  metodoBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.white,
  },
  metodoBtnOn: { backgroundColor: color.primary, borderColor: color.primary },
  adTitulo: { fontSize: 13.5, fontWeight: '800', color: color.text },
  apovBox: { marginTop: 12, borderWidth: 1, borderColor: color.borderSoft, borderRadius: 10, overflow: 'hidden' },
  apovFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 12 },
  apovK: { fontSize: 12, color: color.text2 },
  apovV: { fontSize: 12, color: color.text, fontWeight: '600' },
  apovTotalFila: { backgroundColor: color.bgCard, borderTopWidth: 1, borderTopColor: color.borderSoft },
  apovTotalK: { fontSize: 12.5, fontWeight: '800', color: color.text },
  apovTotalV: { fontSize: 12.5, fontWeight: '800', color: color.primaryDark },
  totalEstimado: { padding: 14, marginTop: 10, gap: 6 },
  totalDivider: { height: 1, backgroundColor: color.borderSoft, marginVertical: 4 },
  totalEstK: { fontSize: 14, fontWeight: '800', color: color.text },
  totalEstV: { fontSize: 15, fontWeight: '800', color: color.primaryDark },
  nextBadge: { alignSelf: 'flex-start', backgroundColor: color.warningBg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, marginBottom: 10 },
  nextTexto: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4, color: color.amber },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: color.borderInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: color.primary, borderColor: color.primary },
  radioFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  radioFilaOn: { borderColor: color.primary, backgroundColor: color.primaryLight },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: color.borderInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 99, backgroundColor: color.primary },
  resumenBox: { backgroundColor: color.bgCard, borderRadius: 12, padding: 12, gap: 6 },
  filaResumen: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  filaResumenK: { fontSize: 12, color: color.text3 },
  filaResumenV: { fontSize: 12.5, fontWeight: '700', color: color.text, flexShrink: 1, textAlign: 'right' },
  // Sub-stepper del pago
  pagoSteps: {
    flexDirection: 'row',
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  pagoStepItem: { flex: 1, alignItems: 'center' },
  pagoDot: {
    width: 26, height: 26, borderRadius: 99, backgroundColor: color.bgCard,
    borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center',
  },
  pagoDotOn: { backgroundColor: color.primary, borderColor: color.primary },
  pagoDotHecho: { backgroundColor: color.success, borderColor: color.success },
  pagoDotTxt: { fontSize: 11.5, fontWeight: '800', color: color.text3 },
  pagoStepLabel: { fontSize: 10, color: color.text3, marginTop: 4, textAlign: 'center' },
  descuentoFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  progressBar: { width: '100%', height: 8, borderRadius: 99, backgroundColor: color.bgCard, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 99, backgroundColor: color.primary },
  // Éxito
  exitoCard: { padding: 22, alignItems: 'center', gap: 6, backgroundColor: color.primaryTint, borderColor: color.primaryLight },
  exitoIcono: {
    width: 64, height: 64, borderRadius: 99, backgroundColor: color.white,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  exitoTitulo: { fontSize: 20, fontWeight: '800', color: color.primaryDark },
  exitoSub: { fontSize: 12.5, color: color.text2, textAlign: 'center', lineHeight: 18 },
  exitoNumeroBox: { alignItems: 'center', marginTop: 10 },
  exitoNumeroLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, color: color.text3 },
  exitoNumero: { fontSize: 22, fontWeight: '800', color: color.text, letterSpacing: 1 },
  exitoTxFila: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8, maxWidth: '100%' },
  exitoTxK: { fontSize: 11.5, color: color.text3 },
  exitoTxV: { fontSize: 11.5, fontWeight: '700', color: color.text, flexShrink: 1 },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  docTitulo: { fontSize: 13.5, fontWeight: '800', color: color.text },
  docSub: { fontSize: 11, color: color.text3, marginTop: 1 },
  docFlecha: { fontSize: 18, color: color.primary, fontWeight: '800' },
  docMini: { height: 180, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: color.borderSoft },
  docMiniCentro: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  docMiniMsg: { fontSize: 11.5, color: color.text3, textAlign: 'center' },
  docFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
})
