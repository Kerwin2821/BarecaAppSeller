/** Formateo de fechas, números y moneda para el app de vendedores. */

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

/** "Hoy · 10:42 a. m." / "Ayer · …" / fecha completa. */
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
  if (dias === 0) return `Hoy · ${horaManual(d)}`
  if (dias === 1) return `Ayer · ${horaManual(d)}`
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

/** Decimal con coma: 87,45 */
export function decimal(v: number | null | undefined, digitos = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const neg = v < 0 ? '−' : ''
  const [entero, dec] = Math.abs(v).toFixed(digitos).split('.')
  return `${neg}${miles(entero)}${dec ? `,${dec}` : ''}`
}

/** Moneda: "Bs. 1.234,50" / "$ 12,00" */
export function moneda(v: number | null | undefined, simbolo = 'Bs.'): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${simbolo} ${decimal(v, 2)}`
}

/** Iniciales para el avatar: "Laura Medina" → "LM" */
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

/** Fecha ISO corta (yyyy-mm-dd) para filtros. */
export function isoDia(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
