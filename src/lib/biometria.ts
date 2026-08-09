import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'

/**
 * Desbloqueo por huella/rostro. Como el login del BFF exige captcha, la
 * biometría no reemplaza el login: sirve para **desbloquear el app reusando la
 * sesión activa** (la cookie de sesión dura ~1 día). Entras una vez con
 * clave+captcha, habilitas la huella, y al reabrir el app la huella te deja
 * pasar sin repetir nada mientras la sesión siga viva.
 */

const K_HABILITADA = 'bareca.biometriaHabilitada'

/** ¿El dispositivo tiene hardware biométrico configurado (huella/rostro)? */
export async function biometriaDisponible(): Promise<boolean> {
  try {
    const hw = await LocalAuthentication.hasHardwareAsync()
    const enrolado = await LocalAuthentication.isEnrolledAsync()
    return hw && enrolado
  } catch {
    return false
  }
}

/** Etiqueta del tipo de biometría disponible (para textos de UI). */
export async function tipoBiometria(): Promise<'Huella' | 'Rostro' | 'Biometría'> {
  try {
    const tipos = await LocalAuthentication.supportedAuthenticationTypesAsync()
    if (tipos.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Rostro'
    if (tipos.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Huella'
    return 'Biometría'
  } catch {
    return 'Biometría'
  }
}

/** Lanza el prompt biométrico del sistema. Devuelve true si autenticó. */
export async function autenticarBiometria(motivo = 'Desbloquea BARECA Vendedores'): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: motivo,
      cancelLabel: 'Usar contraseña',
      disableDeviceFallback: false,
    })
    return r.success
  } catch {
    return false
  }
}

export async function biometriaHabilitada(): Promise<boolean> {
  return (await SecureStore.getItemAsync(K_HABILITADA)) === '1'
}

export async function setBiometriaHabilitada(v: boolean): Promise<void> {
  if (v) await SecureStore.setItemAsync(K_HABILITADA, '1')
  else await SecureStore.deleteItemAsync(K_HABILITADA)
}
