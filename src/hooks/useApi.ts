import { useCallback, useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/api'

interface EstadoApi<T> {
  datos: T | null
  cargando: boolean
  error: string | null
  recargar: () => void
}

/**
 * Ejecuta una petición al montar y cada vez que cambian las dependencias.
 * `cargar` debe ser estable (envuélvelo en useCallback).
 */
export function useApi<T>(
  cargar: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
): EstadoApi<T> {
  const [datos, setDatos] = useState<T | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [n, setN] = useState(0)

  const recargar = useCallback(() => setN((v) => v + 1), [])

  useEffect(() => {
    const ctrl = new AbortController()
    let vivo = true
    setCargando(true)
    setError(null)

    cargar(ctrl.signal)
      .then((r) => {
        if (!vivo) return
        setDatos(r)
        setCargando(false)
      })
      .catch((e: unknown) => {
        if (!vivo || (e as Error)?.name === 'AbortError') return
        setError(mensajeDeError(e))
        setCargando(false)
      })

    return () => {
      vivo = false
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])

  return { datos, cargando, error, recargar }
}
