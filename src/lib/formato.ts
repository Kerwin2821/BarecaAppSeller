/**
 * Formateo espejo de portal/src/lib/format.ts. Hermes trae Intl, pero por si
 * el locale es-VE no está completo en el dispositivo, cada formateador cae a
 * una versión manual equivalente.
 */

const LOCALE = 'es-VE'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function aFecha(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function horaManual(d: Date): string {
  const h24 = d.getHours()
  const sufijo = h24 < 12 ? 'a. m.' : 'p. m.'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${sufijo}`
}

function fechaManual(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

/** "27 jul 2026, 10:42 a. m." */
export function fechaHora(v: string | Date | null | undefined): string {
  const d = aFecha(v)
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat(LOCALE, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d)
  } catch {
    return `${fechaManual(d)}, ${horaManual(d)}`
  }
}

/** "27 jul 2026" */
export function fechaCorta(v: string | Date | null | undefined): string {
  const d = aFecha(v)
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
  } catch {
    return fechaManual(d)
  }
}

/** "10:42 a. m." */
export function hora(v: string | Date | null | undefined): string {
  const d = aFecha(v)
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
  } catch {
    return horaManual(d)
  }
}

/** "Hoy · 10:42 a. m." / "Ayer · 4:20 p. m." / "12 jul 2026, 3:40 p. m." */
export function fechaRelativa(v: string | Date | null | undefined): string {
  const d = aFecha(v)
  if (!d) return 'Nunca'
  const ahora = new Date()
  const difMin = Math.floor((ahora.getTime() - d.getTime()) / 60000)
  if (difMin >= 0 && difMin < 1) return 'Hace un momento'
  if (difMin >= 0 && difMin < 60) return `Hace ${difMin} min`

  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime()
  const dias = Math.round((hoy - dia) / 86400000)
  if (dias === 0) return `Hoy · ${hora(d)}`
  if (dias === 1) return `Ayer · ${hora(d)}`
  return fechaHora(d)
}

function miles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Entero con separador de miles: 1.482 */
export function numero(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const neg = v < 0 ? '−' : ''
  return `${neg}${miles(String(Math.round(Math.abs(v))))}`
}

/** Decimal con separador de miles y coma decimal: 87,4 */
export function decimal(v: number | null | undefined, digitos = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const neg = v < 0 ? '−' : ''
  const [entero, dec] = Math.abs(v).toFixed(digitos).split('.')
  return `${neg}${miles(entero)}${dec ? `,${dec}` : ''}`
}

/** "87,4%" */
export function porcentaje(v: number | null | undefined, digitos = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${decimal(v, digitos)}%`
}

/** "+18%" / "−2%" con el signo tipográfico correcto. */
export function variacion(v: number | null | undefined, digitos = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const signo = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${signo}${decimal(Math.abs(v), digitos)}%`
}

/** mm:ss para la cuenta regresiva de la sesión. */
export function reloj(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** Iniciales para el avatar: "Admin Gómez" → "AG" */
export function iniciales(nombre: string | null | undefined): string {
  if (!nombre) return '··'
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '··'
  return partes
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

/** "ADMIN" → "Administrador"; "OPERADOR" → "Operador". */
export function etiquetaRol(rol: string | null | undefined): string {
  if (rol === 'ADMIN') return 'Administrador'
  if (rol === 'OPERADOR') return 'Operador'
  return rol ?? '—'
}

/** Convierte SHOT_EN_MAYUSCULAS a un título legible si el backend no manda `titulo`. */
export function tituloToma(shot: string): string {
  const mapa: Record<string, string> = {
    FRONTAL_34_IZQ: '3/4 frontal izq.',
    TRASERA_34_DER: '3/4 trasero der.',
    FRONTAL_34_DER: '3/4 frontal der.',
    TRASERA_34_IZQ: '3/4 trasero izq.',
    VIN: 'Serial VIN',
    TABLERO: 'Tablero',
    MOTOR: 'Motor',
    INTERIOR: 'Interior',
    PLACA: 'Placa',
    DETALLE_PIEZA: 'Detalle de daño',
    ALFOMBRA: 'Alfombra',
    TABLERO_DETALLE: 'Tablero (detalle)',
    CAUCHO_DETALLE: 'Caucho (detalle)',
    VIDEO: 'Video',
  }
  if (mapa[shot]) return mapa[shot]
  const limpio = shot.replace(/_/g, ' ').toLowerCase()
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/** "ESTRUCTURAL" → "Estructural"; "SEGURIDAD_ACTIVA" → "Seguridad activa". */
export function etiquetaGrupo(grupo: string): string {
  const limpio = grupo.replace(/_/g, ' ').toLowerCase()
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/** Fecha ISO corta (yyyy-mm-dd) para los filtros de fecha. */
export function isoDia(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
