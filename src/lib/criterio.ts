import type { Criterio, Semaforo } from './tipos'
import { color as tema } from './tema'

/**
 * Criterio de asegurabilidad (docs/API-ADMIN.md):
 *   ≥ 85 → APROBADO (verde) · 60–84 → REVISION (ámbar) · < 60 → RECHAZADO (rojo)
 * El backend envía el criterio; aquí solo derivamos color y respaldo local.
 */
export const UMBRAL_APROBADO = 85
export const UMBRAL_REVISION = 60

export const COLOR: Record<Criterio, string> = {
  APROBADO: tema.success,
  REVISION: tema.amber,
  RECHAZADO: tema.danger,
}

export const ETIQUETA: Record<Criterio, string> = {
  APROBADO: 'Aprobado',
  REVISION: 'Revisión',
  RECHAZADO: 'Rechazado',
}

/** Deriva el criterio a partir del índice BARECA. */
export function criterioDeIndice(indice: number | null | undefined): Criterio | null {
  if (indice === null || indice === undefined || Number.isNaN(indice)) return null
  if (indice >= UMBRAL_APROBADO) return 'APROBADO'
  if (indice >= UMBRAL_REVISION) return 'REVISION'
  return 'RECHAZADO'
}

/** Equivalencia semáforo → criterio para las respuestas que solo traen `semaforo`. */
export function criterioDeSemaforo(s: Semaforo | null | undefined): Criterio | null {
  if (s === 'VERDE') return 'APROBADO'
  if (s === 'AMARILLO') return 'REVISION'
  if (s === 'ROJO') return 'RECHAZADO'
  return null
}

/** Criterio efectivo: se prefiere el del backend y se cae al índice / semáforo. */
export function resolverCriterio(opts: {
  criterio?: Criterio | null
  indice?: number | null
  semaforo?: Semaforo | null
}): Criterio | null {
  if (opts.criterio) return opts.criterio
  const porIndice = criterioDeIndice(opts.indice)
  if (porIndice) return porIndice
  return criterioDeSemaforo(opts.semaforo)
}

export function colorDeCriterio(c: Criterio | null): string {
  return c ? COLOR[c] : tema.text3
}

export function etiquetaDeCriterio(c: Criterio | null): string {
  return c ? ETIQUETA[c] : 'Sin criterio'
}

/** Color a partir del índice (la regla de color siempre se calcula en la app). */
export function colorDeIndice(indice: number | null | undefined): string {
  return colorDeCriterio(criterioDeIndice(indice))
}

/** Nivel de hallazgo → color y etiqueta (política de puntuación BARECA). */
export function nivelHallazgo(nivel: number): { color: string; texto: string } {
  if (nivel >= 3) return { color: tema.danger, texto: 'Crítico' }
  if (nivel === 2) return { color: tema.amber, texto: 'Moderado' }
  if (nivel === 1) return { color: '#CA8A04', texto: 'Leve' }
  return { color: tema.success, texto: 'Sin daño' }
}

/** Nombre legible de un estado de inspección, para el mapa y los listados. */
const NOMBRES_ESTADO: Record<string, string> = {
  CREADA: 'recién creada',
  PAGO_PENDIENTE: 'esperando pago',
  PAGADA: 'lista para capturar',
  CAPTURANDO: 'tomando fotos',
  ANALIZANDO: 'analizando con IA',
  REQUIERE_FOTOS: 'repitiendo fotos',
  COMPLETADA: 'completada',
  REINSPECCION: 'requiere reinspección',
  NO_VERIFICABLE: 'no verificable',
  ANULADA: 'anulada',
}

export function etiquetaEstado(estado: string): string {
  return NOMBRES_ESTADO[estado] ?? estado.toLowerCase().replace(/_/g, ' ')
}
