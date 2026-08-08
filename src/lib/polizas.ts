import { policyApi } from './endpoints'
import type { CurrentUser, DisplayPolicy, PolicyStatus } from './tipos'

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

/** Parámetros de jerarquía según el rol (buildApiParams del portal). */
function filtroJerarquia(user: CurrentUser | null): Record<string, string | undefined> {
  if (!user) return {}
  if (user.kioskoId) return { kioscoId: user.kioskoId }
  if (user.distribuidorId) return { distribuidor: user.distribuidorId }
  if (user.oficinaRegionalId) return { oficinaRegionalId: user.oficinaRegionalId }
  if (user.barecaId) return { barecaId: user.barecaId }
  return {}
}

export async function fetchPolizas(
  user: CurrentUser | null,
  page = 0,
  size = 25,
): Promise<{ items: DisplayPolicy[]; total: number }> {
  const r: any = await policyApi.lista({ page, size, ...filtroJerarquia(user) })
  const data: any[] = Array.isArray(r) ? r : (r?.data ?? [])
  const total: number = Array.isArray(r) ? r.length : (r?.total ?? data.length)
  const items = data.map(mapPoliza).sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())
  return { items, total }
}
