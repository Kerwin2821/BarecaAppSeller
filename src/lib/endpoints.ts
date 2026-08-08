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

// ── Solicitudes de modificación ─────────────────────────────
export const modificationApi = {
  lista: (role: string, parentId: string) =>
    bff<any[]>('/modification-requests', { params: { role, parentId } }),
  crear: (body: unknown) => bff<any>('/modification-requests', { method: 'POST', body }),
  porPoliza: (policyId: string) => bff<any>(`/modification-requests/policy/${encodeURIComponent(policyId)}`),
  actualizarEstado: (id: string, status: string) =>
    bff<any>(`/modification-requests/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } }),
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
