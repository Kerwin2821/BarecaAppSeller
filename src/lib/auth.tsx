import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authApi } from './endpoints'
import { registrarNoAutorizado } from './api'
import {
  borrarSesionGuardada,
  guardarLoginId,
  guardarPerfil,
  leerLoginId,
  leerPerfil,
  obtenerDeviceId,
} from './sesion'
import type { CurrentUser, UserRole, ValidateLoginPayload, ValidateTokenClaims } from './tipos'

export interface DatosLogin {
  identificador: string
  password: string
  turnstileToken: string
  coords?: { latitude: number; longitude: number } | null
}

/** El perfil, cuando el login exige cambio de clave antes de entrar. */
export interface CambioClaveRequerido {
  loginId: string
  email: string
  motivo: 'firstLogin' | 'expired'
  mensaje: string
}

interface AuthCtx {
  listo: boolean
  user: CurrentUser | null
  autenticado: boolean
  cambioClave: CambioClaveRequerido | null
  avisoCierre: string | null
  limpiarAviso: () => void
  iniciarSesion: (datos: DatosLogin) => Promise<{ requiereCambio: boolean }>
  cerrarSesion: () => Promise<void>
  refrescarPerfil: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEL_RE = /^\+?\d[\d\s-]{6,}$/

function mapRol(claims: ValidateTokenClaims): UserRole {
  if (claims.KioscoId) return 'KIOSCO'
  if (claims.distribuidorId) return 'DISTRIBUIDOR'
  if (claims.oficinaRegionalId) return 'OFICINA_REGIONAL'
  if (claims.barecaId) return 'BARECA'
  return 'EMPLEADO'
}

/** Formatea un teléfono venezolano a formato internacional (58...). */
function aInternacional(tel: string): string {
  const d = tel.replace(/\D/g, '')
  if (d.startsWith('58')) return `+${d}`
  if (d.startsWith('0')) return `+58${d.slice(1)}`
  return `+58${d}`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [listo, setListo] = useState(false)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [cambioClave, setCambioClave] = useState<CambioClaveRequerido | null>(null)
  const [avisoCierre, setAvisoCierre] = useState<string | null>(null)

  // Restauración de sesión al arrancar (equivale a tryRestoreSession del portal:
  // valida la cookie contra el BFF y rehidrata el perfil guardado).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const loginId = await leerLoginId()
        const perfil = await leerPerfil()
        if (loginId && perfil) {
          const r = await authApi.validarToken(loginId)
          if (vivo && r.data?.valido) {
            setUser({ ...perfil, loginId })
          } else if (vivo) {
            await borrarSesionGuardada()
          }
        }
      } catch {
        await borrarSesionGuardada()
      } finally {
        if (vivo) setListo(true)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  // Reacción a un 401 en cualquier petición: cerrar y avisar.
  useEffect(() => {
    registrarNoAutorizado(() => {
      setUser(null)
      setAvisoCierre('Tu sesión expiró. Vuelve a iniciar sesión.')
      void borrarSesionGuardada()
    })
  }, [])

  const iniciarSesion = useCallback(async (datos: DatosLogin): Promise<{ requiereCambio: boolean }> => {
    const deviceId = await obtenerDeviceId()

    // 1. Construir el payload (el backend autodetecta correo/teléfono/usuario).
    const payload: ValidateLoginPayload = {
      pass: datos.password, // el BFF hashea con la sal secreta; se envía en claro por HTTPS
      dispositive: 'WEB',
      deviceId,
      recaptchaToken: datos.turnstileToken,
      latitud: datos.coords ? String(datos.coords.latitude) : '0',
      longitud: datos.coords ? String(datos.coords.longitude) : '0',
    }
    const id = datos.identificador.trim()
    if (EMAIL_RE.test(id)) payload.correo = id
    else if (TEL_RE.test(id)) payload.telefono = aInternacional(id)
    else payload.usuario = id

    // 2. validar-logins → loginId
    const validar = await authApi.validarLogins(payload)
    const loginId = validar.data?.logindID
    if (!loginId) throw new Error(validar.message || 'Credenciales inválidas.')

    // 3. generaToken (deja el JWT en cookie HttpOnly)
    const gen = await authApi.generaToken(loginId)
    if (gen.statusCode && gen.statusCode !== 200) {
      throw new Error(gen.message || 'No se pudo generar el token de sesión.')
    }

    // 4. validar-token → claims
    const vt = await authApi.validarToken(loginId)
    if (!vt.data?.valido || !vt.data.claims) {
      throw new Error(vt.message || 'El token de sesión no es válido.')
    }
    const claims = vt.data.claims

    // 5. ¿Requiere cambio de clave? (primer ingreso o expirada)
    try {
      const info = await authApi.infoPassByLoginId(loginId)
      const dias = info.data?.fechaCreacion
        ? Math.floor((Date.now() - new Date(info.data.fechaCreacion).getTime()) / 86400000)
        : null
      const primerLogin = dias !== null && dias <= 10 && info.data?.duracionPass === 25
      if (primerLogin || info.data?.expirado) {
        const req: CambioClaveRequerido = {
          loginId,
          email: claims.email || payload.correo || '',
          motivo: primerLogin ? 'firstLogin' : 'expired',
          mensaje: primerLogin
            ? 'Bienvenido. Por seguridad, en tu primer ingreso debes configurar una nueva contraseña personal.'
            : 'Tu contraseña ha expirado. Por seguridad, debes crear una nueva contraseña.',
        }
        setCambioClave(req)
        return { requiereCambio: true }
      }
    } catch {
      // Si el chequeo de clave falla, continuamos con el login normal.
    }

    // 6. Perfil base desde los claims (nombre real se enriquece luego).
    const base: CurrentUser = {
      id: claims.empleadoId,
      loginId,
      email: claims.email || payload.correo || '',
      role: mapRol(claims),
      rolSecundario: '',
      firstName: '',
      lastName: '',
      phone: '',
      barecaId: claims.barecaId || undefined,
      oficinaRegionalId: claims.oficinaRegionalId || undefined,
      distribuidorId: claims.distribuidorId || undefined,
      kioskoId: claims.KioscoId || undefined,
      associatedProductsIds: [],
    }

    await guardarLoginId(loginId)
    await guardarPerfil(base)
    setUser(base)
    setAvisoCierre(null)

    // 7. Enriquecimiento en segundo plano (nombre real del empleado).
    if (base.id) {
      authApi
        .empleadoByUuid(base.id)
        .then(async (r) => {
          const emp = r.data
          if (!emp) return
          const enriquecido: CurrentUser = {
            ...base,
            firstName: emp.nombres ?? base.firstName,
            lastName: emp.apellidos ?? base.lastName,
            employeeEntityId: emp.id,
            rolSecundario: emp.roles?.rol ?? '',
          }
          setUser((u) => (u ? enriquecido : u))
          await guardarPerfil(enriquecido)
        })
        .catch(() => undefined)
    }

    return { requiereCambio: false }
  }, [])

  const cerrarSesion = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // El cierre local siempre procede aunque el BFF no responda.
    }
    await borrarSesionGuardada()
    setUser(null)
    setCambioClave(null)
    setAvisoCierre(null)
  }, [])

  const refrescarPerfil = useCallback(async () => {
    if (!user?.id) return
    const r = await authApi.empleadoByUuid(user.id)
    const emp = r.data
    if (!emp) return
    const actualizado: CurrentUser = {
      ...user,
      firstName: emp.nombres ?? user.firstName,
      lastName: emp.apellidos ?? user.lastName,
      rolSecundario: emp.roles?.rol ?? user.rolSecundario,
    }
    setUser(actualizado)
    await guardarPerfil(actualizado)
  }, [user])

  const valor = useMemo<AuthCtx>(
    () => ({
      listo,
      user,
      autenticado: !!user,
      cambioClave,
      avisoCierre,
      limpiarAviso: () => setAvisoCierre(null),
      iniciarSesion,
      cerrarSesion,
      refrescarPerfil,
    }),
    [listo, user, cambioClave, avisoCierre, iniciarSesion, cerrarSesion, refrescarPerfil],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return c
}
