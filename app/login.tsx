import { useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/lib/auth'
import { mensajeDeError } from '@/lib/api'
import { Alerta, Boton, Campo } from '@/components/Ui'
import { CaptchaTurnstile } from '@/components/CaptchaTurnstile'
import { color } from '@/lib/tema'

const HAY_CAPTCHA = !!process.env.EXPO_PUBLIC_TURNSTILE_SITEKEY

// Logos a color (el de Caroní es blanco, para fondo oscuro, así que no va aquí).
const PROVEEDORES = [
  require('../assets/logos/logo-estar-seguros.png'),
  require('../assets/logos/logo-laoccidental.png'),
]

export default function Login() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { iniciarSesion, avisoCierre, limpiarAviso } = useAuth()

  const [identificador, setIdentificador] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    if (enviando) return
    if (!identificador.trim() || !password) {
      setError('Ingrese su usuario/correo y contraseña.')
      return
    }
    if (HAY_CAPTCHA && !token) {
      setError('Espere a que termine la verificación de seguridad.')
      return
    }
    setEnviando(true)
    setError(null)
    limpiarAviso()
    try {
      const { requiereCambio } = await iniciarSesion({
        identificador: identificador.trim(),
        password,
        turnstileToken: token ?? '',
      })
      router.replace(requiereCambio ? '/cambiar-clave' : '/')
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
      // El token de Turnstile es de un solo uso: tras un fallo, invalídalo y
      // pide uno nuevo para que el reintento no reuse el token ya consumido.
      setToken(null)
      setResetKey((k) => k + 1)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: color.white }}
        contentContainerStyle={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30, paddingHorizontal: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <Image source={require('../assets/logo-bareca.png')} style={est.logo} />
        <Text style={est.titulo}>Portal de Vendedores</Text>
        <Text style={est.parrafo}>Ingrese sus credenciales para cotizar y emitir pólizas.</Text>

        {avisoCierre ? (
          <View style={{ marginBottom: 16 }}>
            <Alerta tipo="info">{avisoCierre}</Alerta>
          </View>
        ) : null}

        <Campo
          etiqueta="Usuario, correo o teléfono"
          placeholder="tu.usuario o correo@bareca.com"
          autoCapitalize="none"
          autoCorrect={false}
          value={identificador}
          error={!!error}
          onChangeText={(t) => {
            setIdentificador(t)
            setError(null)
          }}
          style={{ marginBottom: 16 }}
        />
        <Campo
          etiqueta="Contraseña"
          placeholder="••••••••••"
          secureTextEntry
          value={password}
          error={!!error}
          onChangeText={(t) => {
            setPassword(t)
            setError(null)
          }}
          onSubmitEditing={enviar}
          returnKeyType="go"
        />

        {HAY_CAPTCHA ? (
          <View style={{ marginTop: 16, alignItems: 'center' }}>
            <CaptchaTurnstile
              resetKey={resetKey}
              onToken={(t) => {
                setToken(t)
                setError(null)
              }}
              onError={(m) => setError(m)}
            />
          </View>
        ) : null}

        {error ? (
          <View style={{ marginTop: 14 }}>
            <Alerta tipo="error">{error}</Alerta>
          </View>
        ) : null}

        <Boton
          texto={enviando ? 'Verificando…' : 'Iniciar Sesión'}
          onPress={enviar}
          cargando={enviando}
          style={{ marginTop: 20, paddingVertical: 14 }}
        />

        <Pressable onPress={() => router.push('/recuperar-contrasena')} style={{ marginTop: 16, alignSelf: 'center' }}>
          <Text style={est.olvido}>¿Olvidaste tu contraseña?</Text>
        </Pressable>

        <View style={est.proveedores}>
          <Text style={est.proveedoresTitulo}>Aseguradoras aliadas</Text>
          <View style={est.proveedoresFila}>
            {PROVEEDORES.map((src, i) => (
              <Image key={i} source={src} style={est.provLogo} />
            ))}
          </View>
        </View>

        <Text style={est.pie}>© {new Date().getFullYear()} Bareca C.A. · Corretaje de Seguros</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const est = StyleSheet.create({
  logo: { width: 168, height: 78, resizeMode: 'contain', alignSelf: 'center', marginBottom: 20 },
  titulo: { fontSize: 23, fontWeight: '800', color: color.text, letterSpacing: -0.4, textAlign: 'center' },
  parrafo: { fontSize: 13, color: color.text2, marginTop: 6, marginBottom: 26, textAlign: 'center', lineHeight: 19 },
  olvido: { fontSize: 12.5, fontWeight: '600', color: color.primary },
  proveedores: { marginTop: 40, alignItems: 'center' },
  proveedoresTitulo: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: color.text4, marginBottom: 12 },
  proveedoresFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, flexWrap: 'wrap' },
  provLogo: { width: 74, height: 34, resizeMode: 'contain', opacity: 0.85 },
  pie: { marginTop: 30, fontSize: 11, color: color.text4, textAlign: 'center' },
})
