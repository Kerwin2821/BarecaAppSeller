import AsyncStorage from '@react-native-async-storage/async-storage'

const K = 'bareca.onboardingVisto'

/** ¿El usuario ya vio el carrusel de bienvenida? */
export async function onboardingVisto(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(K)) === '1'
  } catch {
    return false
  }
}

/** Marca el carrusel de bienvenida como visto (no volverá a aparecer). */
export async function marcarOnboardingVisto(): Promise<void> {
  try {
    await AsyncStorage.setItem(K, '1')
  } catch {
    /* noop */
  }
}

const K_TOUR = 'bareca.tourVisto'

/** ¿El usuario ya hizo la visita guiada dentro del app (home)? */
export async function tourVisto(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(K_TOUR)) === '1'
  } catch {
    return false
  }
}

/** Marca la visita guiada como completada. */
export async function marcarTourVisto(): Promise<void> {
  try {
    await AsyncStorage.setItem(K_TOUR, '1')
  } catch {
    /* noop */
  }
}
