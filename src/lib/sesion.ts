import * as SecureStore from 'expo-secure-store'
import type { Admin } from './tipos'

/**
 * Sesión del vendedor. El equivalente móvil de portal/src/lib/session.ts:
 * en vez de localStorage usa SecureStore (el token queda cifrado por el SO)
 * con una copia en memoria para lecturas síncronas.
 */

const K_TOKEN = 'winspec.token'
const K_EXPIRA = 'winspec.expiraEn'
const K_ADMIN = 'winspec.admin'

export interface Sesion {
  token: string
  expiraEn: string
  admin: Admin
}

type Listener = (s: Sesion | null) => void

const listeners = new Set<Listener>()

/** Copia en memoria: fuente de verdad síncrona tras `cargarSesionInicial`. */
let actual: Sesion | null = null

function emitir() {
  for (const l of listeners) l(actual)
}

/** Se llama una sola vez al arrancar la app, antes de decidir la ruta. */
export async function cargarSesionInicial(): Promise<Sesion | null> {
  try {
    const [token, expiraEn, adminRaw] = await Promise.all([
      SecureStore.getItemAsync(K_TOKEN),
      SecureStore.getItemAsync(K_EXPIRA),
      SecureStore.getItemAsync(K_ADMIN),
    ])
    if (!token || !expiraEn || !adminRaw) {
      actual = null
      return null
    }
    actual = { token, expiraEn, admin: JSON.parse(adminRaw) as Admin }
    return actual
  } catch {
    actual = null
    return null
  }
}

export function leerSesion(): Sesion | null {
  return actual
}

export function guardarSesion(s: Sesion) {
  actual = s
  emitir()
  void SecureStore.setItemAsync(K_TOKEN, s.token)
  void SecureStore.setItemAsync(K_EXPIRA, s.expiraEn)
  void SecureStore.setItemAsync(K_ADMIN, JSON.stringify(s.admin))
}

/** Renueva la marca de expiración con lo que devuelva el backend. */
export function refrescarExpiracion(expiraEn: string) {
  if (!actual || actual.expiraEn === expiraEn) return
  actual = { ...actual, expiraEn }
  emitir()
  void SecureStore.setItemAsync(K_EXPIRA, expiraEn)
}

export function actualizarAdmin(admin: Admin) {
  if (!actual) return
  actual = { ...actual, admin }
  emitir()
  void SecureStore.setItemAsync(K_ADMIN, JSON.stringify(admin))
}

export function borrarSesion() {
  actual = null
  emitir()
  void SecureStore.deleteItemAsync(K_TOKEN)
  void SecureStore.deleteItemAsync(K_EXPIRA)
  void SecureStore.deleteItemAsync(K_ADMIN)
}

export function tokenActual(): string | null {
  return actual?.token ?? null
}

export function suscribir(l: Listener): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Segundos restantes de la sesión (0 si ya venció o no hay sesión). */
export function segundosRestantes(expiraEn: string | null | undefined): number {
  if (!expiraEn) return 0
  const ms = new Date(expiraEn).getTime() - Date.now()
  if (Number.isNaN(ms)) return 0
  return Math.max(0, Math.floor(ms / 1000))
}
