import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AppState } from 'react-native'
import { api, registrarCierreDeSesion, type MotivoCierre } from './api'
import {
  actualizarAdmin,
  borrarSesion,
  cargarSesionInicial,
  guardarSesion,
  leerSesion,
  segundosRestantes,
  suscribir,
  type Sesion,
} from './sesion'
import type { Admin } from './tipos'

interface AuthCtx {
  /** false mientras se lee la sesión guardada del dispositivo. */
  listo: boolean
  sesion: Sesion | null
  admin: Admin | null
  /** Segundos que faltan para que la sesión venza (se actualiza cada segundo). */
  restantes: number
  /** Mensaje que se muestra en /login tras un cierre automático. */
  avisoCierre: string | null
  limpiarAviso: () => void
  iniciarSesion: (usuario: string, password: string) => Promise<Sesion>
  cerrarSesion: () => Promise<void>
  cambiarClave: (actual: string, nueva: string) => Promise<void>
  refrescarAdmin: () => Promise<void>
  /** La raíz de la app lo llama ante cualquier toque (equivale a la actividad en la web). */
  tocar: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

/** Intervalo mínimo entre renovaciones por actividad del usuario (ms). */
const RENOVAR_CADA_MS = 90_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [listo, setListo] = useState(false)
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [restantes, setRestantes] = useState(0)
  const [avisoCierre, setAvisoCierre] = useState<string | null>(null)
  const ultimaRenovacion = useRef(0)

  // Carga inicial desde SecureStore y suscripción a cambios del módulo de sesión.
  useEffect(() => {
    let vivo = true
    const dessuscribir = suscribir(setSesion)
    cargarSesionInicial().then((s) => {
      if (!vivo) return
      setSesion(s)
      setRestantes(segundosRestantes(s?.expiraEn))
      setListo(true)
    })
    return () => {
      vivo = false
      dessuscribir()
    }
  }, [])

  // Reacción a un 401 o a la expiración: cerrar y avisar.
  useEffect(() => {
    registrarCierreDeSesion((motivo: MotivoCierre) => {
      if (motivo === 'expirada') setAvisoCierre('Tu sesión expiró por inactividad')
    })
  }, [])

  // Cuenta regresiva real desde `expiraEn`.
  useEffect(() => {
    if (!sesion) {
      setRestantes(0)
      return
    }
    const calcular = () => {
      const s = segundosRestantes(sesion.expiraEn)
      setRestantes(s)
      if (s <= 0) {
        borrarSesion()
        setAvisoCierre('Tu sesión expiró por inactividad')
      }
    }
    calcular()
    const id = setInterval(calcular, 1000)
    return () => clearInterval(id)
  }, [sesion])

  // La sesión se renueva con actividad: pedimos /auth/me como máximo cada 90 s.
  const renovar = useCallback(() => {
    if (!leerSesion()) return
    const ahora = Date.now()
    if (ahora - ultimaRenovacion.current < RENOVAR_CADA_MS) return
    ultimaRenovacion.current = ahora
    api
      .me()
      .then((r) => actualizarAdmin(r.admin))
      .catch(() => undefined)
  }, [])

  // Volver del segundo plano también cuenta como actividad.
  useEffect(() => {
    if (!sesion) return
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') renovar()
    })
    return () => sub.remove()
  }, [sesion, renovar])

  const iniciarSesion = useCallback(async (usuario: string, password: string) => {
    const r = await api.login(usuario, password)
    const nueva: Sesion = {
      token: r.token,
      expiraEn: r.expiraEn,
      admin: { ...r.admin, debeCambiarClave: r.debeCambiarClave || r.admin.debeCambiarClave },
    }
    guardarSesion(nueva)
    setAvisoCierre(null)
    ultimaRenovacion.current = Date.now()
    return nueva
  }, [])

  const cerrarSesion = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      // El cierre local siempre procede aunque el backend no responda.
    }
    borrarSesion()
    setAvisoCierre(null)
  }, [])

  const cambiarClave = useCallback(async (actual: string, nueva: string) => {
    await api.cambiarClave(actual, nueva)
    const s = leerSesion()
    if (s) actualizarAdmin({ ...s.admin, debeCambiarClave: false })
  }, [])

  const refrescarAdmin = useCallback(async () => {
    const r = await api.me()
    actualizarAdmin(r.admin)
  }, [])

  const valor = useMemo<AuthCtx>(
    () => ({
      listo,
      sesion,
      admin: sesion?.admin ?? null,
      restantes,
      avisoCierre,
      limpiarAviso: () => setAvisoCierre(null),
      iniciarSesion,
      cerrarSesion,
      cambiarClave,
      refrescarAdmin,
      tocar: renovar,
    }),
    [listo, sesion, restantes, avisoCierre, iniciarSesion, cerrarSesion, cambiarClave, refrescarAdmin, renovar],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return c
}
