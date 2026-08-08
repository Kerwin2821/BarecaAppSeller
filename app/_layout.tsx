import { useEffect } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ToastProvider } from '@/components/Toast'
import { Spinner } from '@/components/Estados'
import { color } from '@/lib/tema'

/**
 * Guardia de rutas (espejo de RutaPrivada del portal): exige sesión activa y
 * clave definitiva antes de entrar a las pestañas.
 */
function Guardia({ children }: { children: React.ReactNode }) {
  const { listo, sesion, admin } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (!listo) return
    const enLogin = segments[0] === 'login'
    const enCambio = segments[0] === 'cambiar-clave'

    if (!sesion) {
      if (!enLogin) router.replace('/login')
      return
    }
    if (admin?.debeCambiarClave) {
      if (!enCambio) router.replace('/cambiar-clave')
      return
    }
    if (enLogin || enCambio) router.replace('/')
  }, [listo, sesion, admin?.debeCambiarClave, segments, router])

  if (!listo) {
    return (
      <View style={est.splash}>
        <Image
          source={require('../assets/logo-bareca.png')}
          style={{ width: 190, height: 56, resizeMode: 'contain', marginBottom: 26 }}
        />
        <Spinner size="large" />
      </View>
    )
  }

  return <>{children}</>
}

function Pila() {
  const { tocar } = useAuth()

  return (
    // Cualquier toque en la app cuenta como actividad y renueva la sesión
    // (equivale a los listeners de pointerdown/keydown del portal).
    <View style={{ flex: 1 }} onStartShouldSetResponderCapture={() => (tocar(), false)}>
      <Guardia>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bgApp } }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="cambiar-clave" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="inspecciones/[id]"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
        </Stack>
      </Guardia>
    </View>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Pila />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}

const est = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
