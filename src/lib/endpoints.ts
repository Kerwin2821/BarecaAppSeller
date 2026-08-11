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

  /** Opciones de "Duración de la Contraseña" (Perfil › Seguridad). */
  fechasExpiraciones: () =>
    bff<{ id: number; dias: number; activo: boolean }[]>('/auth/fechas-expiraciones', {
      params: { page: 0, size: 20 },
    }),

  /** Cambia la clave desde Perfil (payload de la web: pass + fechaExpiracionId). */
  cambiarPassPerfil: (payload: { loginId: string; pass: string; fechaExpiracionId: number }) =>
    bff<ApiResponse<string>>('/auth/passwords/v1/actualizar-pass-usuario', {
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

  /** Foto de perfil actual del usuario (Perfil › Información Personal). */
  obtenerFoto: (loginId: string) =>
    bff<ApiResponse<{ url?: string }>>(`/auth/fotos-usuarios/v1/obtener-foto-userio/${encodeURIComponent(loginId)}`, {
      sinCierre: true,
    }),
  /** Sube/actualiza la foto de perfil (multipart `file`). */
  subirFoto: (loginId: string, form: FormData) =>
    bff<ApiResponse<string>>(`/auth/fotos-usuarios/upload/${encodeURIComponent(loginId)}`, { method: 'POST', body: form }),
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

  /** Kioscos de un distribuidor por su id (numérico o UUID). Fallback de la jerarquía. */
  kioscosPorDistribuidor: (distribuidorId: string | number) =>
    bff<any>('/users/kioscos-puestos', { params: { 'distribuidoresId.equals': distribuidorId, page: 0, size: 200 } }),
  /** Distribuidores de una oficina por su id. Fallback de la jerarquía. */
  distribuidoresPorOficina: (oficinaId: string | number) =>
    bff<any>('/users/distribuidores', { params: { 'oficinasRegionalesId.equals': oficinaId, page: 0, size: 200 } }),

  productos: () => bff<any>('/users/productos', { params: { page: 0, size: 200 } }),

  /** Datos de pago del actor (cuentas para recibir comisiones/retiros). */
  datosPagosByActor: (tipoActor: string, uuid: string) =>
    bff<ApiResponse<any[]>>('/users/datos-pagos/v1/datos-pagos/by-actor', { params: { tipoActor, uuid } }),

  /** Registra un método de retiro (Pago Móvil) para recibir comisiones. */
  crearDatosPago: (body: {
    numeroDocumento: string
    telefono: string
    alias: string
    banco: string
    oficinasRegionalesId?: string | null
    distribuidoresId?: string | null
    kioscosPuestosId?: string | null
  }) => bff<ApiResponse<any>>('/users/datos-pagos/v1/datos-pagos', { method: 'POST', body }),
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
  /** Rankings ("Mejores kioscos/distribuidores/oficinas") por nivel descendiente. */
  rankings: (perfil: string, id: string | number, filtros: Record<string, string | number | undefined> = {}) =>
    bff<{ success: boolean; data: { oficinas?: any[]; distribuidores?: any[]; kioscos?: any[] } }>('/reporte/rankings', {
      params: { perfil, id, ...filtros, limit: 10 },
    }),
  /** Opciones de los filtros (proveedores, productos, kioscos, distribuidores, oficinas). */
  opciones: (perfil: string, id: string | number) =>
    bff<{ success: boolean; data: { oficinas?: any[]; distribuidores?: any[]; kioscos?: any[]; proveedores?: any[]; productos?: any[] } }>(
      '/reporte/opciones',
      { params: { perfil, id } },
    ),
  polizas: (perfil: string, id: string | number, filtros: Record<string, string | number | undefined> = {}) =>
    bff<{ success: boolean; data: any }>('/reporte/polizas', { params: { perfil, id, ...filtros } }),
  /** Puntos del mapa de conexiones (red comercial con coordenadas). */
  mapa: (perfil: string, id: string | number) =>
    bff<{ success: boolean; data: any[] }>('/reporte/mapa', { params: { perfil, id } }),
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
  /** Cálculo de APOV (RCV Ocupantes) por cantidad de puestos (por aseguradora). */
  apov: (cantidadPuestos: number, proveedorId?: string) =>
    bff<any>('/policies/cobertura-items/calcularApov', { params: { cantidadPuestos, proveedorId }, sinCierre: true }),
  /** Servicios adicionales que ofrece la aseguradora (Asistencia / Grúa). */
  serviciosOfrecidos: (proveedorId: string) =>
    bff<any[]>('/policies/servicios-config/ofrecidos', { params: { proveedorId }, sinCierre: true }),
  /** Primas de grúa por grupo de la aseguradora (Estar / La Occidental; Caroní no). */
  gruaTarifas: (proveedorId: string) =>
    bff<any[]>('/policies/grua-tarifas/by-proveedor', { params: { proveedorId }, sinCierre: true }),
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
export interface Banco {
  codigo: string
  nombre: string
}
export interface RespuestaDebito {
  code: string
  id: string
  message?: string
  reference?: string
  endtoend?: string
  reference_c?: string
  monto?: string
}
export interface RespuestaConsulta {
  code: string
  success: boolean
  reference: string
}
export interface GatewayPago {
  id: string
  nombre: string
  activo?: boolean
  descripcion?: string
  logo?: string
}

/**
 * Pagos / emisión — endpoints reales del portal (orden-seguros + payments).
 * Réplica de PolicyApiService: convertir monedas, lista de bancos, config de
 * pasarela, crear orden (débito/pago móvil), débito inmediato con OTP, consulta
 * de operación (polling), webhook de pago móvil y finalización de póliza.
 */
export const paymentApi = {
  /** Config de la pasarela (gateways activos + pago móvil habilitado). */
  config: () => bff<ApiResponse<{ gateways: GatewayPago[]; pagoMovilHabilitado: boolean }>>('/payments/config', { sinCierre: true }),
  /** Tasa de cambio: convierte `monto` de `from` a `to` (p. ej. 1 EUR → VES). */
  convertirMoneda: (monto: number, from: string, to: string) =>
    bff<ApiResponse<number>>(`/policies/orden-seguros/v1/convertir-monedas/${monto}/${from}/${to}`, { sinCierre: true }),
  /** Lista de bancos emisores. */
  bancos: () => bff<ApiResponse<Banco[]>>('/policies/pre-ordende-pagos/v1/lista-bancos', { sinCierre: true }),
  /** Comisión prepagada → total neto (número crudo). */
  comisionPrepagada: (body: unknown) => bff<number>('/policies/orden-seguros/v1/comision-prepagada', { method: 'POST', body }),
  /** Comisión/descuento → { monto, porcentajeMaximo }. */
  comisionDescuento: (body: unknown) =>
    bff<{ monto: number; porcentajeMaximo: number }>('/policies/orden-seguros/v1/comision-descuento', { method: 'POST', body }),
  /** ¿Hay póliza vigente para la placa? (evita cobros duplicados). */
  vigentePorPlaca: (placa: string) =>
    bff<any>(`/policies/polizas/v1/vigente/${encodeURIComponent(placa)}`, { sinCierre: true }),
  /** Crea la orden (Débito Inmediato). Devuelve message "Número de orden generado: N". */
  crearOrden: (body: unknown) => bff<ApiResponse<any>>('/policies/orden-seguros/v1/addorden-client', { method: 'POST', body }),
  /** Crea la orden (Pago Móvil). */
  crearOrdenPagoMovil: (body: unknown) => bff<ApiResponse<any>>('/policies/orden-seguros/v1/addorden-client-pagoMovil', { method: 'POST', body }),
  /** Envía el débito inmediato con el OTP → operación (code/id/reference/...). */
  debitoInmediato: (body: unknown) => bff<ApiResponse<RespuestaDebito>>('/policies/orden-seguros/debito-inmediato', { method: 'POST', body }),
  /** Consulta el estado de la operación de débito (polling). */
  consultarOperacion: (body: unknown) => bff<ApiResponse<RespuestaConsulta>>('/policies/orden-seguros/consultar-operacion', { method: 'POST', body }),
  /** Estado del webhook de pago móvil (polling de respaldo). */
  webhookStatus: (orderId: string) => bff<any>(`/webhook/status/${encodeURIComponent(orderId)}`, { sinCierre: true }),
  /** Póliza por número (tras confirmar el pago móvil). */
  polizaPorNumero: (params: Record<string, string | number | undefined>) => bff<any>('/policies/polizas', { params, sinCierre: true }),
  /** Emisión final de la póliza tras confirmar el pago (crea cuadro + carnet). */
  finalizePolicy: (body: unknown) => bff<ApiResponse<any>>('/payments/finalize-policy', { method: 'POST', body }),
}

// ── OCR (IA) de cédula y carnet de circulación ──────────────
export const aiApi = {
  /** Cédula (Flujo Express): multipart `file`. Proxy del BFF al OCR externo. */
  extractCedula: (form: FormData) =>
    bff<{ success: boolean; data: any }>('/ai/extract-cedula', { method: 'POST', body: form }),
  /** Fallback Gemini (cédula o certificado) por base64. Réplica de processImageWithGemini. */
  ocrProcess: (image: string, mimeType: string, type: 'cedula' | 'certificado') =>
    bff<{ success: boolean; data: any }>('/ai/ocr-process', { method: 'POST', body: { image, mimeType, type } }),
}

/**
 * OCR primario (flujo normal): micro de clientes. En QA suele dar 403 y el
 * llamador cae al fallback de Gemini (`aiApi.ocrProcess`). `sinCierre` evita que
 * un 401/403 cierre la sesión (equivale al SKIP_ERROR_HANDLING de la web).
 */
export const ocrApi = {
  processCedula: (form: FormData) =>
    bff<{ statusCode?: number; data: any }>('/clients/clientes/process-cedula', { method: 'POST', body: form, sinCierre: true }),
  processCertificado: (form: FormData) =>
    bff<{ statusCode?: number; data: any }>('/clients/clientes/process-certificado', { method: 'POST', body: form, sinCierre: true }),
}

/**
 * Validaciones en vivo del paso de cliente (réplica de los async validators del
 * portal): placa con póliza vigente, correo y teléfono ya registrados. Si hay
 * coincidencia, la web bloquea el avance.
 */
export const validacionApi = {
  /** ¿La placa tiene una póliza vigente? (checkActivePolicy). */
  polizaVigentePorPlaca: (placa: string) =>
    bff<any>(`/policies/polizas/v1/vigente/${encodeURIComponent(placa)}`, { sinCierre: true }),
  /** ¿El correo ya existe? (checkEmailExists) → data:boolean. */
  existeCorreo: (email: string) =>
    bff<ApiResponse<boolean>>(`/clients/correos/existe-correo/${encodeURIComponent(email)}`, { sinCierre: true }),
  /** ¿El teléfono (internacional) ya existe? (checkPhoneExists) → data:boolean. */
  existeTelefono: (intl: string) =>
    bff<ApiResponse<boolean>>(`/clients/telefonos/existe-telefono/${encodeURIComponent(intl)}`, { sinCierre: true }),
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
  /** Alta unificada (CreateEntityBffPayload: entityType/creatorName/userRole/context/formData/currentUserCtx). */
  unifiedCreate: (body: unknown) => bff<any>('/users/team/unified-create', { method: 'POST', body }),
  /**
   * Topes de comisión por producto que el creador puede asignar (min = comisionMinima,
   * max = porcentajeComision). tipoActor = rol del creador.
   */
  comisionesMinima: (tipoActor: string, actorUuid: string) =>
    bff<any[]>('/users/comisiones-nodos/v1/comisiones-nodos/minima', { params: { tipoActor, actorUuid } }),
}

// ── Staging de cliente + vehículo (antes de crear la orden) ─
export const clientStageApi = {
  /** Busca un cliente por documento (para no duplicar). */
  buscarPorDocumento: (doc: string) =>
    bff<any>('/clients/clientes', { params: { 'numeroDocumento.equals': doc, page: 0, size: 20 }, sinCierre: true }),
  /** Crea el cliente (add-cliente). */
  addCliente: (body: unknown) => bff<ApiResponse<any>>('/clients/clientes/v1/add-cliente', { method: 'POST', body }),
  /** Agrega teléfono al cliente (best-effort). */
  addTelefono: (body: unknown) => bff<ApiResponse<any>>('/clients/telefonos/v1/add-phone', { method: 'POST', body }),
  /** Agrega correo al cliente (best-effort). */
  addCorreo: (body: unknown) => bff<ApiResponse<any>>('/clients/correos/v1/add-email', { method: 'POST', body }),
  /** Agrega dirección al cliente (best-effort). */
  addDireccion: (body: unknown) => bff<ApiResponse<any>>('/clients/direcciones/v1/aad-addrees', { method: 'POST', body }),
}

export const vehiculoRegApi = {
  /** Registra el vehículo → devuelve el id de registro para la orden. */
  addRegistro: (body: unknown) => bff<ApiResponse<any>>('/policies/registros-vehiculos/v1/addRegisterVehicle', { method: 'POST', body }),
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
  /** Finaliza la póliza funeraria (crea cuadro + carnet). */
  finalizarPoliza: (body: unknown) =>
    bff<ApiResponse<any>>('/clients/polizas-funerarios/v1/finalizar-poliza', { method: 'POST', body }),
  /** Parentescos (para el payload de asegurados). */
  parentescos: () => bff<any>('/clients/parentescos', { params: { page: 0, size: 50 }, sinCierre: true }),
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
