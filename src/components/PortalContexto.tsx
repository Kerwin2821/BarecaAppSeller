import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { api } from '../lib/api'
import { useApi } from '../hooks/useApi'
import type { DashboardRes } from '../lib/tipos'

/**
 * Contexto que el layout de pestañas entrega a las pantallas (espejo del
 * ContextoPortal del portal): evita pedir /dashboard dos veces entre el
 * encabezado ("en vivo") y la pantalla Dashboard.
 */
export interface ContextoPortal {
  dashboard: DashboardRes | null
  cargandoDashboard: boolean
  errorDashboard: string | null
  recargarDashboard: () => void
}

const Ctx = createContext<ContextoPortal | null>(null)

export function PortalProvider({ children }: { children: ReactNode }) {
  const cargar = useCallback((signal: AbortSignal) => api.dashboard(signal), [])
  const { datos, cargando, error, recargar } = useApi<DashboardRes>(cargar)

  return (
    <Ctx.Provider
      value={{
        dashboard: datos,
        cargandoDashboard: cargando,
        errorDashboard: error,
        recargarDashboard: recargar,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function usePortal(): ContextoPortal {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePortal debe usarse dentro de <PortalProvider>')
  return c
}
