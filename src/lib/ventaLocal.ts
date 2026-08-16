/**
 * Marca local "vendí hoy". Al emitir una póliza guardamos la fecha local del
 * dispositivo; el home la lee para poner a Beca feliz al instante, SIN depender de
 * que el backend ya cuente la venta ni de la zona horaria de `saleDate`. Se limpia
 * sola al cambiar el día (se compara contra la fecha local de hoy). Por loginId.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const K = 'bareca.ventaHoy'

/** Fecha local de hoy como "YYYY-M-D" (sin UTC, para no desfasar el día). */
function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const clave = (loginId?: string | number | null) => `${K}.${loginId ?? 'anon'}`

/** Registra que el vendedor emitió una póliza hoy. */
export async function marcarVentaHoy(loginId?: string | number | null): Promise<void> {
  try {
    await AsyncStorage.setItem(clave(loginId), hoyLocal())
  } catch {
    /* noop */
  }
}

/** ¿El vendedor emitió una póliza HOY (según el flag local)? */
export async function vendioHoyLocal(loginId?: string | number | null): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(clave(loginId))) === hoyLocal()
  } catch {
    return false
  }
}
