/**
 * Tipos espejo del contrato en contexto-bareca / docs/API-ADMIN.md.
 * No se agregan campos que el backend no documente.
 */

export type Rol = 'ADMIN' | 'OPERADOR'

export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO'

export type Criterio = 'APROBADO' | 'REVISION' | 'RECHAZADO'

/** Error normalizado del backend: `{ error, mensaje }`. */
export interface ApiError {
  error: string
  mensaje: string
}

// ── Autenticación ───────────────────────────────────────────

export interface Admin {
  id: string
  usuario: string
  nombre: string
  email: string
  rol: Rol
  debeCambiarClave: boolean
  ultimoAcceso: string | null
}

/** POST /auth/login */
export interface LoginRes {
  token: string
  expiraEn: string
  debeCambiarClave: boolean
  admin: Admin
}

/** GET /auth/me — renueva la sesión */
export interface MeRes {
  admin: Admin
  expiraEn: string
}

/** POST /auth/cambiar-clave */
export interface OkRes {
  ok: boolean
}

// ── Dashboard ───────────────────────────────────────────────

export interface TendenciaPunto {
  semana: string
  cantidad: number
}

export interface AsegurabilidadDist {
  aprobado: number
  revision: number
  rechazado: number
}

/** GET /dashboard */
export interface DashboardRes {
  totalMes: number
  totalHistorico: number
  variacionMes: number
  indiceAsegurabilidad: number
  tiempoPromedioMin: number
  enVivo: number
  tendencia: TendenciaPunto[]
  asegurabilidad: AsegurabilidadDist
}

// ── Inspecciones ────────────────────────────────────────────

/** GET /inspections — elemento de la lista paginada */
export interface InspeccionItem {
  id: string
  codigo: string
  vehiculo: string
  placa: string
  vin: string
  estado: string
  indice: number | null
  semaforo: Semaforo | null
  creadaEn: string
  lat: number | null
  lng: number | null
  direccion: string | null
  inspector: string | null
  thumbUrl: string | null
}

/**
 * El contrato documenta la ruta paginada pero no el envoltorio exacto.
 * Se aceptan las dos formas usuales del backend (`items`/`total`/`page`)
 * y también un arreglo plano.
 */
export interface PaginaInspecciones {
  items: InspeccionItem[]
  total: number
  page: number
}

/** GET /inspections/mapa */
export interface PuntoMapa {
  id: string
  codigo: string
  lat: number
  lng: number
  placa: string
  vehiculo: string
  indice: number | null
  semaforo: Semaforo | null
  creadaEn: string
  estado: string
  /** Trabajo en marcha: aún no hay informe cerrado. */
  enCurso: boolean
  responsable: string | null
  responsableEmail: string | null
  /** Ruta de la foto de perfil del inspector (null si no tiene). */
  responsableFoto: string | null
  /** Solo si el punto es la posición del inspector: cuán fresca es. */
  ubicacionEn: string | null
}

export interface Foto {
  id: string
  shot: string
  titulo: string
  url: string
}

export interface GrupoPuntaje {
  grupo: string
  peso: number
  puntaje: number
}

export interface Hallazgo {
  piezaId: string
  pieza: string
  grupo: string
  nivel: number
  tipo: string
  descripcion: string
}

export interface Asegurabilidad {
  porcentaje: number
  criterio: Criterio
}

/** GET /inspections/{id} — expediente completo (resultado del análisis PLANO) */
export interface Expediente {
  id: string
  codigo: string
  vehiculo: string
  placa: string
  vin: string
  estado: string
  creadaEn: string
  lat: number | null
  lng: number | null
  direccion: string | null
  inspector: string | null
  thumbUrl: string | null
  fotos: Foto[]
  videoUrl: string | null
  videoDuracionSeg: number | null
  asegurabilidad: Asegurabilidad | null
  indice: number | null
  semaforo: Semaforo | null
  confianza: number | null
  hallazgos: Hallazgo[] | null
  grupos: GrupoPuntaje[] | null
  leyendas: string[] | null
  banderas: string[] | null
  odometroKm: number | null
  marca: string | null
  modelo: string | null
  anio: number | null
  color: string | null
  analizadaEn: string | null
  inspectorEmail: string | null
  testigos: unknown
  shareToken: string | null
}

// ── Usuarios del portal ─────────────────────────────────────

/** GET /users */
export interface UsuarioPortal {
  id: string
  usuario: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  debeCambiarClave: boolean
  ultimoAcceso: string | null
  creadoEn: string
}

/** POST /users */
export interface CrearUsuarioReq {
  usuario: string
  nombre: string
  email: string
  rol: Rol
}

/** PATCH /users/{id} */
export interface EditarUsuarioReq {
  nombre?: string
  email?: string
  rol?: Rol
  activo?: boolean
}
