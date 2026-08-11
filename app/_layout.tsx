import { useEffect } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ToastProvider } from '@/components/Toast'
import { Spinner } from '@/components/Estados'
import { color } from '@/lib/tema'

/** Rutas accesibles sin sesión. */
const PUBLICAS = ['login', 'recuperar-contrasena', 'verificar']

/** Pantalla de bloqueo por huella (sesión activa, esperando desbloqueo). */
function Bloqueo() {
  const { desbloquear } = useAuth()
  useEffect(() => {
    void desbloquear()
  }, [desbloquear])
  return (
    <View style={est.splash}>
      <Image source={require('../assets/logo-bareca.png')} style={est.logo} />
      <Text style={est.bloqueoTexto}>App bloqueado</Text>
      <Pressable onPress={() => desbloquear()} style={est.bloqueoBtn}>
        <Text style={est.bloqueoBtnTexto}>Desbloquear con huella</Text>
      </Pressable>
    </View>
  )
}

function Guardia({ children }: { children: React.ReactNode }) {
  const { listo, autenticado, cambioClave, bloqueado } = useAuth()
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
  // Con sesión activa y huella habilitada, exige desbloqueo antes de mostrar el app.
  if (autenticado && bloqueado) return <Bloqueo />
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
  logo: { width: 224, height: 70, resizeMode: 'contain' },
  bloqueoTexto: { fontSize: 14, fontWeight: '700', color: color.text2 },
  bloqueoBtn: { backgroundColor: color.primary, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 26 },
  bloqueoBtnTexto: { color: '#fff', fontSize: 14, fontWeight: '800' },
})
