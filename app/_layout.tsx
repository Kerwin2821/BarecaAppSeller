import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from '@expo-google-fonts/inter'
import { AuthProvider, useAuth } from '@/lib/auth'
import { onboardingVisto } from '@/lib/onboarding'
import { aplicarFuenteInter } from '@/lib/fuente'
import { ToastProvider } from '@/components/Toast'
import { LoaderBareca } from '@/components/LoaderBareca'
import { color } from '@/lib/tema'

// Aplica Inter a todo el texto del app (parchea Text.render una vez).
aplicarFuenteInter()

/** Rutas accesibles sin sesión. */
const PUBLICAS = ['login', 'recuperar-contrasena', 'verificar', 'bienvenida']

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
  const [onbVisto, setOnbVisto] = useState<boolean | null>(null)
  const onbRedirigido = useRef(false)

  useEffect(() => {
    onboardingVisto().then(setOnbVisto)
  }, [])

  useEffect(() => {
    if (!listo || onbVisto === null) return
    const seg0 = segments[0] ?? ''
    const enPublica = PUBLICAS.includes(seg0)
    const enCambio = seg0 === 'cambiar-clave'

    if (cambioClave) {
      if (!enCambio) router.replace('/cambiar-clave')
      return
    }
    if (!autenticado) {
      // Primer arranque (sin sesión): carrusel de bienvenida antes del login.
      if (!onbVisto && !onbRedirigido.current && seg0 !== 'bienvenida' && seg0 !== 'verificar') {
        onbRedirigido.current = true
        router.replace('/bienvenida')
        return
      }
      if (!enPublica) router.replace('/login')
      return
    }
    // Autenticado: si está en login/cambiar-clave/bienvenida, entrar al app.
    if (seg0 === 'login' || enCambio || seg0 === 'bienvenida') router.replace('/')
  }, [listo, onbVisto, autenticado, cambioClave, segments, router])

  if (!listo || onbVisto === null) {
    return (
      <View style={est.splash}>
        <Image source={require('../assets/logo-bareca.png')} style={est.logo} />
        <LoaderBareca size={56} />
      </View>
    )
  }
  // Con sesión activa y huella habilitada, exige desbloqueo antes de mostrar el app.
  if (autenticado && bloqueado) return <Bloqueo />
  return <>{children}</>
}

export default function RootLayout() {
  const [fuentesListas] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  })

  if (!fuentesListas) {
    return (
      <View style={est.splash}>
        <Image source={require('../assets/logo-bareca.png')} style={est.logo} />
        <LoaderBareca size={56} />
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Guardia>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bgApp } }}>
              <Stack.Screen name="bienvenida" />
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
