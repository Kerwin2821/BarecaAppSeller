/**
 * Visita guiada tipo "spotlight" (coach-marks): en vez de un modal centrado, oscurece
 * la pantalla y deja un HUECO iluminado sobre el botón real, con una burbuja + flecha
 * que explica qué hace. Recorre elemento por elemento la primera vez que se entra.
 *
 * Piezas:
 *  - `TourProvider`: guarda los objetivos (refs por id) y el estado del recorrido.
 *  - `useObjetivoTour(id)`: devuelve un ref para colgar en el elemento a resaltar.
 *  - `TourOverlay` (componente aparte): dibuja el spotlight + la burbuja.
 *
 * Los objetivos viven en componentes distintos (header, home, barra inferior); por eso
 * el proveedor va alto en el árbol (layout del grupo autenticado) y cada objetivo se
 * registra por id. La medición usa `measureInWindow` (NO `measureLayout`, que falla en
 * Fabric).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { useAuth } from './auth'
import { puedeGestionarEquipo, puedeVender } from './roles'
import { marcarTourVisto } from './onboarding'
import type { UserRole } from './tipos'

export type PasoTour = {
  /** id del objetivo (debe coincidir con el `useObjetivoTour(id)` del elemento). */
  id: string
  emoji?: string
  titulo: string
  desc: string
  /** Si se define y devuelve false para el rol, el paso se omite. */
  visible?: (rol: UserRole | null | undefined) => boolean
}

/** Recorrido de arriba a abajo: header → tarjeta → accesos → barra inferior. */
export const PASOS_TOUR: PasoTour[] = [
  { id: 'menu', emoji: '☰', titulo: 'Menú', desc: 'Ábrelo para llegar a todas las secciones del app.' },
  { id: 'campana', emoji: '🔔', titulo: 'Notificaciones', desc: 'Avisos de pagos, comisiones y novedades. El punto rojo marca las no leídas.' },
  { id: 'comision', emoji: '💳', titulo: 'Comisión acumulada', desc: 'Lo que llevas ganado. Tócala para ver el detalle de tus comisiones.' },
  { id: 'retirar', emoji: '💸', titulo: 'Retirar comisión', desc: 'Solicita el retiro de tu comisión disponible en tiempo real.' },
  { id: 'acc-reporte', emoji: '📊', titulo: 'Reporte', desc: 'Consulta y descarga el reporte de tus pólizas.' },
  { id: 'acc-rachas', emoji: '🔥', titulo: 'Rachas', desc: 'Cumple tu meta diaria y gana premios manteniendo tu racha.' },
  { id: 'acc-equipo', emoji: '👥', titulo: 'Equipo', desc: 'Administra tu red: oficinas, distribuidores y kioscos.', visible: puedeGestionarEquipo },
  { id: 'acc-soporte', emoji: '💬', titulo: 'Soporte', desc: 'Abre un ticket o chatea con soporte si necesitas ayuda.' },
  { id: 'tab-inicio', emoji: '🏠', titulo: 'Inicio', desc: 'Tu pantalla principal: comisión, meta del día y últimas pólizas.' },
  { id: 'tab-ventas', emoji: '📄', titulo: 'Ventas', desc: 'Todas tus pólizas emitidas, con su estado y documentos.' },
  { id: 'tab-vender', emoji: '🛒', titulo: 'Vender', desc: 'El botón central: cotiza y emite una póliza RCV en pocos pasos.', visible: puedeVender },
  { id: 'tab-comisiones', emoji: '💰', titulo: 'Comisiones', desc: 'Revisa lo generado y el historial de tus retiros.' },
  { id: 'tab-perfil', emoji: '🧑', titulo: 'Perfil', desc: 'Tus datos, seguridad (huella) y métodos de cobro para tus retiros.' },
]

interface TourValue {
  registrar: (id: string, ref: RefObject<unknown>) => void
  desregistrar: (id: string) => void
  refDe: (id: string) => RefObject<unknown> | undefined
  activo: boolean
  pasos: PasoTour[]
  indice: number
  iniciar: () => void
  siguiente: () => void
  anterior: () => void
  terminar: () => void
}

const Ctx = createContext<TourValue | null>(null)

export function useTour(): TourValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTour debe usarse dentro de <TourProvider>')
  return v
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const refs = useRef<Map<string, RefObject<unknown>>>(new Map())
  const [activo, setActivo] = useState(false)
  const [indice, setIndice] = useState(0)

  const pasos = useMemo(() => PASOS_TOUR.filter((p) => !p.visible || p.visible(user?.role)), [user?.role])

  const registrar = useCallback((id: string, ref: RefObject<unknown>) => {
    refs.current.set(id, ref)
  }, [])
  const desregistrar = useCallback((id: string) => {
    refs.current.delete(id)
  }, [])
  const refDe = useCallback((id: string) => refs.current.get(id), [])

  const iniciar = useCallback(() => {
    setIndice(0)
    setActivo(true)
  }, [])
  const terminar = useCallback(() => {
    setActivo(false)
    void marcarTourVisto()
  }, [])
  const siguiente = useCallback(() => setIndice((i) => Math.min(i + 1, pasos.length - 1)), [pasos.length])
  const anterior = useCallback(() => setIndice((i) => Math.max(i - 1, 0)), [])

  const value = useMemo<TourValue>(
    () => ({ registrar, desregistrar, refDe, activo, pasos, indice, iniciar, siguiente, anterior, terminar }),
    [registrar, desregistrar, refDe, activo, pasos, indice, iniciar, siguiente, anterior, terminar],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Devuelve un ref para colgar en el elemento que el tour debe resaltar. */
export function useObjetivoTour(id: string): RefObject<View | null> {
  const { registrar, desregistrar } = useTour()
  const ref = useRef<View | null>(null)
  useEffect(() => {
    registrar(id, ref as RefObject<unknown>)
    return () => desregistrar(id)
  }, [id, registrar, desregistrar])
  return ref
}

/**
 * Envoltorio opcional: resalta a `children` sin tener que tocar el componente hijo.
 * `collapsable={false}` es imprescindible en Android para que la View se pueda medir.
 */
export function ObjetivoTour({ id, style, children }: { id: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const ref = useObjetivoTour(id)
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  )
}
