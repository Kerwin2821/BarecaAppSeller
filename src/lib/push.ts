import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { notifApi } from './endpoints'
import { obtenerDeviceId } from './sesion'
import { actorUuid } from './roles'
import type { CurrentUser } from './tipos'

/**
 * Notificaciones push (FCM).
 *
 * El "token" que el panel administrativo usa para enviar la notificación es el
 * **token de registro FCM** del dispositivo. Aquí lo obtenemos y lo mandamos al
 * backend asociado al usuario (`notifApi.registrarDispositivo`).
 *
 * ⚠️ Requiere un **development build** (o build de producción): Expo Go en
 * Android (SDK 54) ya no entrega tokens de push. En Expo Go esto falla en
 * silencio (no rompe el login). También hace falta `google-services.json` del
 * proyecto Firebase configurado en `app.json` (android.googleServicesFile).
 */

// Muestra las notificaciones aunque el app esté en primer plano.
// En un entorno sin el módulo nativo (p.ej. Expo Go) importar no debe romper el app.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
} catch {
  /* noop */
}

let yaRegistrado = false
let ultimoToken: string | null = null

/** Último token FCM obtenido en esta sesión (o null). */
export function tokenPushActual(): string | null {
  return ultimoToken
}

/**
 * Obtiene el token FCM del dispositivo (pidiendo permiso si hace falta), sin
 * enviarlo al backend. Útil para mostrarlo en pantalla y copiarlo en la prueba.
 * Devuelve null en Expo Go / emulador / sin permiso.
 */
export async function obtenerTokenPush(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null
    const actual = await Notifications.getPermissionsAsync()
    let concedido = actual.granted
    if (!concedido && actual.canAskAgain) concedido = (await Notifications.requestPermissionsAsync()).granted
    if (!concedido) return null
    const resp = await Notifications.getDevicePushTokenAsync()
    const token = typeof resp?.data === 'string' ? resp.data : String(resp?.data ?? '')
    ultimoToken = token || null
    return ultimoToken
  } catch {
    return null
  }
}

/**
 * Pide permiso, obtiene el token FCM del dispositivo y lo registra en el backend.
 * Devuelve el token (para debug) o null si no se pudo (Expo Go, sin permiso, etc.).
 */
export async function registrarPush(user: CurrentUser): Promise<string | null> {
  try {
    if (yaRegistrado) return null
    // Emuladores/simuladores no entregan un token de push real.
    if (!Device.isDevice) return null

    // 1. Permiso de notificaciones (lo pide una sola vez).
    const actual = await Notifications.getPermissionsAsync()
    let concedido = actual.granted
    if (!concedido && actual.canAskAgain) {
      const pedido = await Notifications.requestPermissionsAsync()
      concedido = pedido.granted
    }
    if (!concedido) return null

    // 2. Canal Android (necesario para que se muestren las notificaciones).
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    // 3. Token nativo de push = token de registro FCM (Android) / APNs (iOS).
    const resp = await Notifications.getDevicePushTokenAsync()
    const token = typeof resp?.data === 'string' ? resp.data : String(resp?.data ?? '')
    if (!token) return null

    // 4. Guardar en el backend, asociado al usuario (no bloquea si falla).
    await notifApi
      .registrarDispositivo({
        loginId: user.loginId,
        tipoActor: user.role,
        actorUuid: actorUuid(user) ?? '',
        deviceId: await obtenerDeviceId(),
        token,
        plataforma: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
      })
      .catch(() => {})

    ultimoToken = token
    yaRegistrado = true
    if (__DEV__) console.log('[push] token FCM registrado:', token)
    return token
  } catch (e) {
    // Expo Go (sin dev build) u otros: nunca bloquear el flujo del app.
    if (__DEV__) console.log('[push] no se pudo registrar (¿Expo Go?):', String(e))
    return null
  }
}
