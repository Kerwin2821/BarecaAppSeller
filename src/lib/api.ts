import { borrarSesion, refrescarExpiracion, tokenActual } from './sesion'
import type {
  CrearUsuarioReq,
  DashboardRes,
  EditarUsuarioReq,
  Expediente,
  InspeccionItem,
  LoginRes,
  MeRes,
  OkRes,
  PaginaInspecciones,
  PuntoMapa,
  UsuarioPortal,
} from './tipos'

/**
 * Base del API admin (ambiente QA por defecto, ver .env).
 * A diferencia del portal web no hay proxy: la app siempre llama al dominio completo.
 */
export const API_BASE: string = (
  process.env.EXPO_PUBLIC_API_URL ?? 'https://winspec.barecaonline.com/api/v1/admin'
).replace(/\/$/, '')

export class ApiException extends Error {
  readonly status: number
  readonly codigo: string

  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje)
    this.name = 'ApiException'
    this.status = status
    this.codigo = codigo
  }
}

/** Motivo por el que se cerró la sesión, para avisar en /login. */
export type MotivoCierre = 'expirada' | 'manual'

let alExpirar: ((motivo: MotivoCierre) => void) | null = null

/** El AuthProvider registra aquí la reacción a un 401 / sesión vencida. */
export function registrarCierreDeSesion(fn: (motivo: MotivoCierre) => void) {
  alExpirar = fn
}

function cerrarPorNoAutorizado() {
  borrarSesion()
  if (alExpirar) alExpirar('expirada')
}

/** Ruta de un endpoint del portal: siempre cuelga de la base del API. */
function urlApi(ruta: string): string {
  return `${API_BASE}/${ruta.replace(/^\//, '')}`
}

/**
 * Resuelve una URL de media que devuelve el backend. Puede llegar absoluta
 * (`https://…`), con la base ya incluida (`/api/v1/admin/media/…`), como ruta
 * del contrato (`/media/full/…`) o relativa a la base (`media/full/…`).
 */
export function resolverUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith(`${API_BASE}/`)) return url
  if (/^\/?media\//.test(url)) return urlApi(url)
  if (url.startsWith('/')) {
    // Ruta absoluta del dominio (p. ej. /api/v1/admin/media/…): se antepone el origen.
    const origen = API_BASE.replace(/^(https?:\/\/[^/]+).*$/i, '$1')
    return `${origen}${url}`
  }
  return urlApi(url)
}

/** Cabeceras con el token vigente, para pedir media protegida (Image/Video). */
export function cabecerasMedia(): Record<string, string> {
  const t = tokenActual()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function cabeceras(conJson: boolean): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' }
  if (conJson) h['Content-Type'] = 'application/json'
  const t = tokenActual()
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

interface OpcionesPeticion {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** No cerrar la sesión ante un 401 (se usa en el login). */
  sinCierreAutomatico?: boolean
}

async function peticion<T>(ruta: string, opts: OpcionesPeticion = {}): Promise<T> {
  const { method = 'GET', body, signal, sinCierreAutomatico } = opts

  let res: Response
  try {
    res = await fetch(urlApi(ruta), {
      method,
      headers: cabeceras(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new ApiException(0, 'red', 'No se pudo conectar con el servidor. Verifique su conexión.')
  }

  if (res.status === 401 && !sinCierreAutomatico) {
    cerrarPorNoAutorizado()
    throw new ApiException(401, 'no_autorizado', 'Su sesión expiró. Vuelva a iniciar sesión.')
  }

  // Renovación de sesión por cabecera, si el backend la envía.
  const cabExpira = res.headers.get('X-Expira-En')
  if (cabExpira) refrescarExpiracion(cabExpira)

  if (res.status === 204) return undefined as T

  const texto = await res.text()
  let datos: unknown = null
  if (texto) {
    try {
      datos = JSON.parse(texto)
    } catch {
      datos = null
    }
  }

  if (!res.ok) {
    const e = datos as { error?: string; mensaje?: string } | null
    throw new ApiException(
      res.status,
      e?.error ?? 'error',
      e?.mensaje ?? `El servidor respondió ${res.status}.`,
    )
  }

  // Cualquier respuesta que traiga `expiraEn` refresca la cuenta regresiva.
  if (datos && typeof datos === 'object' && 'expiraEn' in datos) {
    const v = (datos as { expiraEn?: unknown }).expiraEn
    if (typeof v === 'string') refrescarExpiracion(v)
  }

  return datos as T
}

export const api = {
  // ── Autenticación ───────────────────────────────────────
  login: (usuario: string, password: string) =>
    peticion<LoginRes>('/auth/login', {
      method: 'POST',
      body: { usuario, password },
      sinCierreAutomatico: true,
    }),

  cambiarClave: (actual: string, nueva: string) =>
    peticion<OkRes>('/auth/cambiar-clave', { method: 'POST', body: { actual, nueva } }),

  logout: () => peticion<void>('/auth/logout', { method: 'POST' }),

  me: (signal?: AbortSignal) => peticion<MeRes>('/auth/me', { signal }),

  // ── Dashboard ───────────────────────────────────────────
  dashboard: (signal?: AbortSignal) => peticion<DashboardRes>('/dashboard', { signal }),

  // ── Inspecciones ────────────────────────────────────────
  inspecciones: (
    p: { page?: number; size?: number; estado?: string; q?: string } = {},
    signal?: AbortSignal,
  ) =>
    peticion<PaginaInspecciones | InspeccionItem[]>(
      `/inspections${qs({ page: p.page, size: p.size, estado: p.estado, q: p.q })}`,
      { signal },
    ),

  mapa: (p: { desde?: string; hasta?: string } = {}, signal?: AbortSignal) =>
    peticion<PuntoMapa[]>(`/inspections/mapa${qs({ desde: p.desde, hasta: p.hasta })}`, { signal }),

  expediente: (id: string, signal?: AbortSignal) =>
    peticion<Expediente>(`/inspections/${encodeURIComponent(id)}`, { signal }),

  /** URL completa del PDF del peritaje (se descarga con el token en la cabecera). */
  urlReportePdf: (id: string) => urlApi(`/inspections/${encodeURIComponent(id)}/report.pdf`),

  // ── Usuarios del portal ─────────────────────────────────
  usuarios: (signal?: AbortSignal) => peticion<UsuarioPortal[]>('/users', { signal }),

  crearUsuario: (datos: CrearUsuarioReq) =>
    peticion<UsuarioPortal>('/users', { method: 'POST', body: datos }),

  editarUsuario: (id: string, datos: EditarUsuarioReq) =>
    peticion<UsuarioPortal>(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: datos }),

  resetClave: (id: string) =>
    peticion<OkRes>(`/users/${encodeURIComponent(id)}/reset-clave`, { method: 'POST' }),

  desactivarUsuario: (id: string) =>
    peticion<void>(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const p: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      p.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    }
  }
  return p.length ? `?${p.join('&')}` : ''
}

/** Normaliza la lista de inspecciones venga paginada o como arreglo plano. */
export function normalizarPagina(r: PaginaInspecciones | InspeccionItem[]): PaginaInspecciones {
  if (Array.isArray(r)) return { items: r, total: r.length, page: 0 }
  return { items: r.items ?? [], total: r.total ?? 0, page: r.page ?? 0 }
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof ApiException) return e.message
  if (e instanceof Error) return e.message
  return 'Ocurrió un error inesperado.'
}
