import { bff, desenvolver } from './api'
import type {
  ApiResponse,
  CurrentUser,
  DisplayPolicy,
  Notificacion,
  PasswordInfo,
  PolicyPdfs,
  ReportKpis,
  ValidateLoginPayload,
  ValidateTokenClaims,
} from './tipos'

/**
 * Endpoints del BFF usados por el app, agrupados por dominio. Rutas exactas
 * tomadas de los services del portal `policy-market`.
 */

// ── Autenticación ───────────────────────────────────────────
export const authApi = {
  validarLogins: (payload: ValidateLoginPayload) =>
    bff<ApiResponse<{ logindID: string }>>('/auth/logins/v1/validar-logins', {
      method: 'POST',
      body: payload,
      sinCierre: true,
    }),

  generaToken: (loginId: string) =>
    bff<ApiResponse<unknown>>('/auth/secciones-tokens/v1/generaToken', {
      method: 'POST',
      body: { loginId },
      sinCierre: true,
    }),

  validarToken: (loginId: string) =>
    bff<ApiResponse<{ valido: boolean; claims?: ValidateTokenClaims & { email?: string } }>>(
      '/auth/secciones-tokens/v1/validar-token',
      { method: 'POST', body: { loginId }, sinCierre: true },
    ),

  infoPassByLoginId: (loginId: string) =>
    bff<ApiResponse<PasswordInfo>>(`/auth/passwords/v1/info-pass-login/${encodeURIComponent(loginId)}`, {
      sinCierre: true,
    }),

  actualizarPass: (payload: { loginId: string; passActual?: string; passNueva: string; ping?: string }) =>
    bff<ApiResponse<unknown>>('/auth/passwords/v1/actualizar-pass-usuario', {
      method: 'PATCH',
      body: payload,
    }),

  // Recuperación de contraseña (OTP por correo)
  otpCambioPass: (correo: string) =>
    bff<ApiResponse<string>>('/auth/passwords/v2/otp-cambio-pass', {
      method: 'PATCH',
      body: { correo },
      sinCierre: true,
    }),
  validarOtpRecovery: (correo: string, opt: string) =>
    bff<ApiResponse<unknown>>('/auth/passwords/v2/validar-opt-recovery', {
      method: 'PATCH',
      body: { correo, opt },
      sinCierre: true,
    }),

  logout: () => bff<ApiResponse<unknown>>('/auth/logout', { method: 'POST', body: {}, sinCierre: true }),
}

// ── Usuarios / jerarquía (enriquecimiento del perfil, filtros JHipster) ──────
/** Devuelve el primer elemento del arreglo JHipster filtrado por `campo.equals=uuid`. */
async function primeroPorUuid(recurso: string, campo: string, uuid: string): Promise<any | null> {
  const r = await bff<any>(`/users/${recurso}`, { params: { [`${campo}.equals`]: uuid, page: 0, size: 1 } })
  const arr = Array.isArray(r) ? r : (r?.data ?? [])
  return arr.length > 0 ? arr[0] : null
}

export const userApi = {
  empleadoByUuid: (uuid: string) => primeroPorUuid('empleados', 'empleadoId', uuid),
  barecaByUuid: (uuid: string) => primeroPorUuid('barecas', 'barecaId', uuid),
  oficinaByUuid: (uuid: string) => primeroPorUuid('oficinas-regionales', 'oficinaRegionalId', uuid),
  distribuidorByUuid: (uuid: string) => primeroPorUuid('distribuidores', 'distribuidorId', uuid),
  kioscoByUuid: (uuid: string) => primeroPorUuid('kioscos-puestos', 'kioscosPuestosId', uuid),

  /** Jerarquía completa del equipo del usuario (offices/distributors/kiosks/employees). */
  teamHierarchy: (params: Record<string, string | number | undefined>) =>
    bff<any>('/users/team/hierarchy', { params }),

  productos: () => bff<any>('/users/productos', { params: { page: 0, size: 200 } }),
}

// ── Pólizas (Mis Ventas) ────────────────────────────────────
// Base real del microservicio de pólizas en el BFF: /api/policies
export const policyApi = {
  lista: (params: Record<string, string | number | undefined> = {}) =>
    bff<ApiResponse<any> | any[]>('/policies/polizas', { params }),

  cascoMisVentas: (params: Record<string, string | number | undefined> = {}) =>
    bff<ApiResponse<any> | any[]>('/policies/casco/mis-ventas', { params }),

  funerariasMisVentas: (params: Record<string, string | number | undefined> = {}) =>
    bff<ApiResponse<any> | any[]>('/clients/polizas-funerarios', { params }),

  infoOrden: (orderId: string) =>
    bff<ApiResponse<any>>(`/payments/info-orden/${encodeURIComponent(orderId)}`),

  regenerarPdfs: (numeroOrden: string) =>
    bff<ApiResponse<PolicyPdfs>>(`/payments/regenerate-pdfs/${encodeURIComponent(numeroOrden)}`),
}

// ── Notificaciones (campana) ────────────────────────────────
export const notifApi = {
  mine: (perfil: string, destinoId?: number | null) =>
    bff<ApiResponse<Notificacion[]>>('/notifications/mine', { params: { perfil, destinoId: destinoId ?? undefined } }),
  read: (loginId: string) =>
    bff<ApiResponse<number[]>>('/notifications/read', { params: { loginId } }),
  markRead: (loginId: string, id: number) =>
    bff<ApiResponse<unknown>>('/notifications/read', { method: 'POST', body: { id, loginId } }),
}

// ── Reporte de pólizas ──────────────────────────────────────
export const reportApi = {
  kpis: (perfil: string, id: string | number, filtros: Record<string, string | number | undefined> = {}) =>
    bff<{ success: boolean; data: ReportKpis }>('/reporte/kpis', { params: { perfil, id, ...filtros } }),
  polizas: (perfil: string, id: string | number, filtros: Record<string, string | number | undefined> = {}) =>
    bff<{ success: boolean; data: any[] }>('/reporte/polizas', { params: { perfil, id, ...filtros } }),
}

// ── Comisiones (bajo /api/users) ────────────────────────────
export const comisionApi = {
  /** Totales de comisión del actor. Params reales: tipo, uuid. */
  totales: (tipo: string, uuid: string) =>
    bff<any>('/users/comision-transaccion-items/v1/totales', { params: { tipo, uuid } }),
  subarbol: (params: Record<string, string | number | undefined> = {}) =>
    bff<any>('/users/comision-transaccions/v1/transacciones/subarbol', { params }),
  ordenesPago: (params: Record<string, string | number | undefined> = {}) =>
    bff<any>('/users/pago-comision-ordens/v1/ordenes', { params }),
}

// ── RCV: cotización (clase → grupo → tarifa), público ───────
export interface ClaseVehiculo { id: string; nombre: string; codigo?: string }
export interface GrupoVehiculo { id: string; descripcion: string; codigo?: string }
export interface ProductoAseguradora {
  productoId: string
  nombre: string
  proveedor?: { proveedorId?: string | null; id?: number; nombre?: string }
}
export interface Proveedor {
  id: number
  proveedorId: string
  nombre: string
}
export const rcvApi = {
  clases: () =>
    bff<ClaseVehiculo[]>('/policies/clase-vehiculos', {
      params: { 'activo.equals': 'TRUE', page: 0, size: 100, sort: 'nombre' }, sinCierre: true,
    }),
  gruposPorClase: (claseId: string) =>
    bff<{ data: GrupoVehiculo[] } | GrupoVehiculo[]>('/policies/grupo-vehiculos/grupo-by-clase', {
      params: { claseId, activo: 'TRUE' }, sinCierre: true,
    }),
  /** Aseguradoras = productos. Se filtran a RCV en la pantalla. */
  productos: () =>
    bff<ProductoAseguradora[]>('/users/productos', { params: { page: 0, size: 100 }, sinCierre: true }),
  /** Proveedores (para resolver el proveedorId UUID por producto.proveedor.id). */
  proveedores: () =>
    bff<Proveedor[]>('/users/proveedores', { params: { page: 0, size: 100 }, sinCierre: true }),
  /** Planes (tarifas de cobertura) por grupo + producto + proveedor. */
  planes: (grupoId: string, productoId: string, proveedorId: string) =>
    bff<{ data: any[] } | any[]>(
      `/policies/tarifa-coberturas/tarifa-by-grupo/${encodeURIComponent(grupoId)}/${encodeURIComponent(productoId)}/${encodeURIComponent(proveedorId)}/TRUE`,
      { sinCierre: true },
    ),
  /** Cálculo de APOV (RCV Ocupantes) por cantidad de puestos. */
  apov: (cantidadPuestos: number) =>
    bff<any>('/policies/cobertura-items/calcularApov', { params: { cantidadPuestos }, sinCierre: true }),
}

// ── Casco: planes con prima (público, para Nueva Venta) ─────
export interface CascoCobertura {
  coberturaId: number
  nombre: string
  esPorcentaje: boolean
  prima: number
  sumaCobertura: number
}
export interface CascoPlan {
  planId: number
  planNombre: string
  sumaAsegurada: number
  totalPrimaAnual: number
  coberturas: CascoCobertura[]
}
export const cascoApi = {
  planes: (catVersionAnioId: string) =>
    bff<CascoPlan[]>('/policies/casco/planes', { params: { catVersionAnioId }, sinCierre: true }),
}

// ── Catálogo de vehículos (público, para Nueva Venta) ───────
// Cascada marca → modelo → versión → año. Enruta a ServiceRcvCaroni.
export const catalogoApi = {
  marcas: (anio?: number) =>
    bff<{ id: string; nombre: string }[]>('/policies/catalogo-vehiculos/marcas', {
      params: { anio }, sinCierre: true,
    }),
  modelos: (marcaId: string, anio?: number) =>
    bff<{ id: string; nombre: string }[]>('/policies/catalogo-vehiculos/modelos', {
      params: { marcaId, anio }, sinCierre: true,
    }),
  versiones: (modeloId: string, anio?: number) =>
    bff<{ id: string; nombre: string }[]>('/policies/catalogo-vehiculos/versiones', {
      params: { modeloId, anio }, sinCierre: true,
    }),
  anios: (versionId: string) =>
    bff<{ id: string; anio: number }[]>('/policies/catalogo-vehiculos/anios', {
      params: { versionId }, sinCierre: true,
    }),
}

// ── Solicitudes de modificación ─────────────────────────────
export const modificationApi = {
  lista: (role: string, parentId: string) =>
    bff<any[]>('/modification-requests', { params: { role, parentId } }),
  crear: (body: unknown) => bff<any>('/modification-requests', { method: 'POST', body }),
  porPoliza: (policyId: string) => bff<any>(`/modification-requests/policy/${encodeURIComponent(policyId)}`),
  actualizarEstado: (id: string, status: string) =>
    bff<any>(`/modification-requests/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } }),
}

// ── Pagos / Emisión ─────────────────────────────────────────
export const paymentApi = {
  /** Config de la pasarela (bancos, pago móvil habilitado, etc.). */
  config: () => bff<any>('/payments/config'),
  /** Emisión final de la póliza tras confirmar el pago (crea cuadro + carnet). */
  finalizePolicy: (body: unknown) => bff<any>('/payments/finalize-policy', { method: 'POST', body }),
}

// ── OCR (IA) de cédula y carnet de circulación ──────────────
export const aiApi = {
  /** Cédula: multipart `file`. Devuelve `{success, data:{nombres, apellidos, numeroDocumento, fechaNacimiento, genero...}}`. */
  extractCedula: (form: FormData) =>
    bff<{ success: boolean; data: any }>('/ai/extract-cedula', { method: 'POST', body: form }),
  /** Carnet/certificado: base64. Devuelve `{success, data:{placa, serialNiv, serialMotor, color, marca, modelo...}}`. */
  ocrProcess: (image: string, mimeType: string, type: 'cedula' | 'certificado') =>
    bff<{ success: boolean; data: any }>('/ai/ocr-process', { method: 'POST', body: { image, mimeType, type } }),
}

// ── Geo (estados/municipios/ciudades) para Datos del Cliente ─
export interface GeoOpcion { id: number; nombre: string }
export const geoApi = {
  estados: () => bff<any>('/clients/states', { params: { size: 50, sort: 'nombre,asc' } }),
  municipios: (stateId: number) =>
    bff<any>('/clients/municipios', { params: { 'stateId.equals': stateId, size: 600, sort: 'nombre,asc' } }),
  ciudades: (stateId: number) =>
    bff<any>('/clients/ciudads', { params: { 'stateId.equals': stateId, size: 2000, sort: 'nombre,asc' } }),
}

// ── Soporte (tickets) ───────────────────────────────────────
export const ticketsApi = {
  mios: (loginId: string) =>
    bff<{ success: boolean; data: any[] }>(`/tickets/mios/${encodeURIComponent(loginId)}`),
  crear: (body: unknown) => bff<any>('/tickets', { method: 'POST', body }),
}

// ── Rachas / retos (bajo /reporte) ──────────────────────────
export const rachasApi = {
  retos: (perfil: string, id: string | number) =>
    bff<{ success: boolean; data: any }>('/reporte/retos', { params: { perfil, id } }),
  resumen: (perfil: string, id: string | number) =>
    bff<{ success: boolean; data: any }>('/reporte/racha-resumen', { params: { perfil, id } }),
}

// ── Equipo (alta unificada de entidad) ──────────────────────
export const teamApi = {
  unifiedCreate: (body: unknown) => bff<any>('/users/team/unified-create', { method: 'POST', body }),
}

// ── Funerario (planes/opciones de cobertura + emisión) ──────
export interface PlanFunerario {
  id: string
  numero?: string
  sumaAsegurada: number
  cobertura: string
  numeroAsegurado?: number
  primaAnualSeg: number
  primaAnualGrupo: number
  activo: boolean
  escalaEdad: { id?: string; desde: number; hasta: number | null; activo?: boolean | null }
  productoId: string
  proveedorId: string
}

export const funerarioApi = {
  /** Lista de opciones de cobertura (planes funerarios). Réplica de getFuneralPlans(). */
  planes: () =>
    bff<PlanFunerario[] | ApiResponse<PlanFunerario[]>>('/clients/opciones-coberturas', {
      params: { page: 0, size: 50 },
    }),
  /** ¿El documento tiene una póliza funeraria vigente? */
  vigentePorDocumento: (documento: string) =>
    bff<ApiResponse<any>>(`/clients/polizas-funerarios/v1/vigente/${encodeURIComponent(documento)}`, {
      sinCierre: true,
    }),
  /** Crea la orden funeraria (débito). Réplica de createFuneralOrder. */
  crearOrden: (body: unknown) =>
    bff<ApiResponse<any>>('/clients/ordens/v1/addorden-client', { method: 'POST', body }),
  /** Crea la orden funeraria por Pago Móvil. Réplica de createFuneralPagoMovilOrder. */
  crearOrdenPagoMovil: (body: unknown) =>
    bff<ApiResponse<any>>('/clients/ordens/v1/addorden-client-pagoMovil', { method: 'POST', body }),
}

// ── Público (verificación de póliza por QR) ─────────────────
import { urlBff } from './api'
export const publicApi = {
  /** Documento público de la póliza (destino del QR de cuadro/carnet). */
  urlDocumento: (policyNumber: string) =>
    urlBff(`/public/documento/ver/${encodeURIComponent(policyNumber)}`),
  verificar: (policyNumber: string) =>
    bff<ApiResponse<any>>(`/public/documento/ver/${encodeURIComponent(policyNumber)}`, { sinCierre: true }),
}

export { desenvolver }
export type { CurrentUser }
