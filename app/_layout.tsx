import { useEffect } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ToastProvider } from '@/components/Toast'
import { Spinner } from '@/components/Estados'
import { color } from '@/lib/tema'

/** Rutas accesibles sin sesión. */
const PUBLICAS = ['login', 'recuperar-contrasena', 'verificar']

function Guardia({ children }: { children: React.ReactNode }) {
  const { listo, autenticado, cambioClave } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (!listo) return
    const seg0 = segments[0] ?? ''
    const enPublica = PUBLICAS.includes(seg0)
    const enCambio = seg0 === 'cambiar-clave'

    if (cambioClave) {
      if (!enCambio) router.replace('/cambiar-clave')
      return
    }
    if (!autenticado) {
      if (!enPublica) router.replace('/login')
      return
    }
    // Autenticado: si está en login/cambiar-clave, entrar al app.
    if (seg0 === 'login' || enCambio) router.replace('/')
  }, [listo, autenticado, cambioClave, segments, router])

  if (!listo) {
    return (
      <View style={est.splash}>
        <Image source={require('../assets/logo-bareca.png')} style={est.logo} />
        <Spinner size="large" />
      </View>
    )
  }
  return <>{children}</>
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Guardia>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bgApp } }}>
              <Stack.Screen name="login" />
              <Stack.Screen name="recuperar-contrasena" />
              <Stack.Screen name="cambiar-clave" />
              <Stack.Screen name="(app)" />
              <Stack.Screen name="verificar/[policyNumber]" />
            </Stack>
          </Guardia>
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}

const est = StyleSheet.create({
  splash: { flex: 1, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center', gap: 26 },
  logo: { width: 200, height: 90, resizeMode: 'contain' },
})
