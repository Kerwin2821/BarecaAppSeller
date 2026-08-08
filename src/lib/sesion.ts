import * as SecureStore from 'expo-secure-store'
import type { CurrentUser } from './tipos'

/**
 * Persistencia de sesión del vendedor. El JWT vive en una cookie HttpOnly que
 * maneja el SO (no lo guardamos), así que aquí solo persistimos el `loginId` y
 * el perfil para restaurar la sesión al abrir el app (equivalente al
 * `user_session_*` de localStorage del portal).
 */

const K_LOGIN_ID = 'bareca.loginId'
const K_PERFIL = 'bareca.perfil'
const K_DEVICE = 'bareca.deviceId'

export async function guardarLoginId(loginId: string) {
  await SecureStore.setItemAsync(K_LOGIN_ID, loginId)
}
export async function leerLoginId(): Promise<string | null> {
  return SecureStore.getItemAsync(K_LOGIN_ID)
}

export async function guardarPerfil(perfil: CurrentUser) {
  await SecureStore.setItemAsync(K_PERFIL, JSON.stringify(perfil))
}
export async function leerPerfil(): Promise<CurrentUser | null> {
  const raw = await SecureStore.getItemAsync(K_PERFIL)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CurrentUser
  } catch {
    return null
  }
}

export async function borrarSesionGuardada() {
  await Promise.all([
    SecureStore.deleteItemAsync(K_LOGIN_ID),
    SecureStore.deleteItemAsync(K_PERFIL),
  ])
}

/**
 * Identificador de dispositivo estable y persistente (equivale al deviceId del
 * portal, allá `crypto.randomUUID()` en localStorage). Se manda en el login.
 */
export async function obtenerDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(K_DEVICE)
  if (!id) {
    id = generarUuid()
    await SecureStore.setItemAsync(K_DEVICE, id)
  }
  return id
}

function generarUuid(): string {
  // UUID v4 sin dependencias (evita depender de crypto.randomUUID en Hermes).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
