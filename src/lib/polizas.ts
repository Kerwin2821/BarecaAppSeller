import { policyApi } from './endpoints'
import type { CurrentUser, DisplayPolicy, PolicyStatus } from './tipos'

export type CategoriaPoliza = 'vehicle' | 'auto' | 'funeral'

/**
 * Mapeo del contrato `/polizas` → DisplayPolicy, portado de PoliciesService
 * del portal (transformPolicyLight + resolveStatus + resolveInsuranceName).
 */

const FUNERAL_PRODUCT_ID = '6fa459ea-ee8a-4ca4-894e-db77e160355e'

export function resolveInsuranceName(id?: string | null, fallback = 'CARONI'): string {
  const v = (id || '').toLowerCase()
  if (v.includes('e07cac79') || v.includes('b8cb8d5a') || v.includes('occidental')) return 'Seguros La Occidental'
  if (v.includes('9bf7425e') || v.includes('estar')) return 'Estar Seguros'
  if (v.includes('188cad25') || v.includes('caroni')) return 'Seguros Caroní'
  return fallback || 'CARONI'
}

function resolveStatus(p: any): PolicyStatus {
  const statusApi = p?.ordenSeguro?.estados?.estado ?? (p?.activo === 'TRUE' ? 'Vigente' : 'Inactiva')
  if (statusApi === 'PROCESADO' || statusApi === 'VIGENTE') return 'Vigente'
  if (statusApi === 'INACTIVA' || statusApi === 'FINALIZADA') return 'Inactiva'
  return 'Procesado'
}

function nombreCliente(p: any): string {
  const t = p?.titular
  if (t) {
    if (t.razonSocial) return String(t.razonSocial).trim()
    if (t.nombres) return `${t.nombres}${t.apellidos ? ` ${t.apellidos}` : ''}`.trim()
  }
  return (p?.clienteId as string) ?? 'Cliente Desconocido'
}

export function mapPoliza(p: any): DisplayPolicy {
  const orden = p?.ordenSeguro
  return {
    id: p?.id,
    policyNumber: p?.numeroPoliza ?? '',
    category: p?.productoId === FUNERAL_PRODUCT_ID ? 'funeral' : 'vehicle',
    clientName: nombreCliente(p),
    clientDocument: p?.titular?.numeroDocumento ?? '',
    productName: resolveInsuranceName(p?.proveedorId ?? p?.productoId, orden?.seguro ?? 'N/A'),
    orderNumber: orden?.numeroOrden ?? '',
    saleDate: p?.fecha ?? '',
    startDate: orden?.fechaIncio ?? '',
    endDate: orden?.fechaFin ?? '',
    status: resolveStatus(p),
    sellerName: '',
    sellerDocument: '',
    vehicleDetails: orden?.registrosVehiculos
      ? {
          plate: orden.registrosVehiculos.placa || 'N/A',
          make: orden.registrosVehiculos?.marcas?.marca ?? '',
          model: orden.registrosVehiculos?.modelos?.modelo ?? '',
          serialNIV: orden.registrosVehiculos?.seririalNIV ?? '',
          year: orden.registrosVehiculos?.annios?.annio ?? '',
          vehicleType: orden.registrosVehiculos?.tiposVehiculos?.tipoVehiculo ?? '',
          vehicleUse: orden.registrosVehiculos?.uso ?? '',
        }
      : undefined,
  }
}

/** Casco (transformCascoLight del portal). */
export function mapCasco(c: any): DisplayPolicy {
  const estado = String(c?.estado || '').toUpperCase()
  const status: PolicyStatus =
    estado === 'INACTIVA' || estado === 'ANULADA' || estado === 'FINALIZADA' ? 'Inactiva' : 'Vigente'
  return {
    id: c?.id,
    policyNumber: c?.numeroPoliza || 'N/A',
    category: 'auto',
    clientName: String(c?.clienteNombre || c?.clienteDocumento || 'Cliente').trim(),
    clientDocument: c?.clienteDocumento ?? '',
    productName: 'Seguro de Auto (Casco)',
    orderNumber: c?.numeroOrden ?? '',
    saleDate: c?.fecha ?? '',
    startDate: '',
    endDate: '',
    status,
    sellerName: '',
    sellerDocument: '',
    financials: {
      totalPremium: Number(c?.totalPrima ?? 0),
      currency: 'USD',
      paymentMethod: '',
      referenceNumber: '',
      rcvAmount: 0,
      conversionRate: 0,
      additionalTotal: 0,
      planTotal: Number(c?.sumaAsegurada ?? 0),
    },
    vehicleDetails: {
      plate: c?.placa || 'N/A',
      make: '',
      model: c?.planNombre || '',
      serialNIV: c?.serialCarroceria || '',
      year: '',
      vehicleType: 'Auto (Casco)',
      vehicleUse: '',
    },
  }
}

/** Funeraria (transformFuneralLight del portal). */
export function mapFuneral(f: any): DisplayPolicy {
  const cli = f?.cliente
  let clientName = 'Cliente Desconocido'
  if (cli) {
    if (cli.razonSocial) clientName = cli.razonSocial
    else if (cli.nombres) clientName = `${cli.nombres}${cli.apellidos ? ` ${cli.apellidos}` : ''}`
    else if (cli.numeroDocumento) clientName = cli.numeroDocumento
  }
  return {
    id: f?.id,
    policyNumber: f?.numeroPolizas ?? '', // la API usa el plural
    category: 'funeral',
    clientName: clientName.trim(),
    clientDocument: cli?.numeroDocumento ?? '',
    productName: 'Servicio Funerario',
    orderNumber: f?.orden?.numeroOrden ?? '',
    saleDate: f?.fecha ?? f?.fechaCreacion ?? '',
    startDate: f?.fechaInicio ?? '',
    endDate: f?.fechaFin ?? '',
    status: f?.activo ? 'Vigente' : 'Inactiva',
    sellerName: '',
    sellerDocument: '',
  }
}

/**
 * RCV (/policies/polizas) y Funeraria (/clients/polizas-funerarios) son endpoints
 * de criterios JHipster: solo enlazan `campo.equals`. La relación del distribuidor
 * se filtra por `distribuidor.equals` (nombre de la relación), NO `distribuidorId`.
 */
function filtroJerarquiaJhipster(user: CurrentUser | null): Record<string, string | undefined> {
  if (!user) return {}
  if (user.kioskoId) return { 'kioscoId.equals': user.kioskoId }
  if (user.distribuidorId) return { 'distribuidor.equals': user.distribuidorId }
  if (user.oficinaRegionalId) return { 'oficinaRegionalId.equals': user.oficinaRegionalId }
  if (user.barecaId) return { 'barecaId.equals': user.barecaId }
  return {}
}

/** Casco (/policies/casco/mis-ventas) usa params planos (distribuidor→distribuidorId). */
function filtroJerarquiaCasco(user: CurrentUser | null): Record<string, string | undefined> {
  if (!user) return {}
  if (user.kioskoId) return { kioscoId: user.kioskoId }
  if (user.distribuidorId) return { distribuidorId: user.distribuidorId }
  if (user.oficinaRegionalId) return { oficinaRegionalId: user.oficinaRegionalId }
  if (user.barecaId) return { barecaId: user.barecaId }
  return {}
}

function desenvolverLista(r: any): { data: any[]; total: number } {
  const data: any[] = Array.isArray(r) ? r : (r?.data ?? [])
  const total: number = Array.isArray(r) ? r.length : (r?.total ?? data.length)
  return { data, total }
}

/**
 * Trae las pólizas de una categoría desde su endpoint real (como el
 * fetchSoldPolicies del portal: un API por categoría) y las mapea a DisplayPolicy.
 */
export async function fetchPolizas(
  user: CurrentUser | null,
  categoria: CategoriaPoliza = 'vehicle',
  page = 0,
  size = 25,
): Promise<{ items: DisplayPolicy[]; total: number }> {
  let r: any
  let mapper: (x: any) => DisplayPolicy
  if (categoria === 'auto') {
    r = await policyApi.cascoMisVentas({ page, size, ...filtroJerarquiaCasco(user) })
    mapper = mapCasco
  } else if (categoria === 'funeral') {
    r = await policyApi.funerariasMisVentas({ page, size, ...filtroJerarquiaJhipster(user) })
    mapper = mapFuneral
  } else {
    r = await policyApi.lista({ page, size, ...filtroJerarquiaJhipster(user) })
    mapper = mapPoliza
  }
  const { data, total } = desenvolverLista(r)
  const items = data.map(mapper).sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())
  return { items, total }
}
