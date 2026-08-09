import { useEffect, useState } from 'react'
import {
  Alert,
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
import {
  autenticarBiometria,
  biometriaDisponible,
  biometriaHabilitada,
  guardarCredencialLogin,
  leerCredencialLogin,
  loginBiometricoListo,
  setBiometriaHabilitada,
  tipoBiometria,
} from '@/lib/biometria'
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
  const [huellaLista, setHuellaLista] = useState(false)
  const [bioTipo, setBioTipo] = useState('huella')

  // ¿Hay login biométrico configurado? (habilitado + credenciales guardadas)
  useEffect(() => {
    ;(async () => {
      setHuellaLista(await loginBiometricoListo())
      setBioTipo((await tipoBiometria()).toLowerCase())
    })()
  }, [])

  /** Realiza el login con las credenciales dadas y el token de captcha vigente. */
  const hacerLogin = async (id: string, pass: string) => {
    if (HAY_CAPTCHA && !token) {
      setError('Espere a que termine la verificación de seguridad.')
      return
    }
    setEnviando(true)
    setError(null)
    limpiarAviso()
    try {
      const { requiereCambio } = await iniciarSesion({
        identificador: id.trim(),
        password: pass,
        turnstileToken: token ?? '',
      })
      // Tras un login exitoso, ofrece activar la huella (si el equipo la tiene
      // y aún no está configurada). El usuario decide.
      if (!requiereCambio && (await biometriaDisponible()) && !(await biometriaHabilitada())) {
        const tipo = (await tipoBiometria()).toLowerCase()
        Alert.alert(
          `Ingresar con ${tipo}`,
          `¿Quieres activar el ingreso con ${tipo} para la próxima vez?`,
          [
            { text: 'Ahora no', style: 'cancel', onPress: () => router.replace('/') },
            {
              text: 'Activar',
              onPress: async () => {
                const ok = await autenticarBiometria(`Activar ingreso con ${tipo}`)
                if (ok) {
                  await guardarCredencialLogin({ identificador: id.trim(), password: pass })
                  await setBiometriaHabilitada(true)
                }
                router.replace('/')
              },
            },
          ],
        )
        return
      }
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

  const enviar = async () => {
    if (enviando) return
    if (!identificador.trim() || !password) {
      setError('Ingrese su usuario/correo y contraseña.')
      return
    }
    await hacerLogin(identificador, password)
  }

  const ingresarConHuella = async () => {
    if (enviando) return
    if (HAY_CAPTCHA && !token) {
      setError('Espere a que termine la verificación de seguridad y reintente.')
      return
    }
    const ok = await autenticarBiometria(`Ingresar con ${bioTipo}`)
    if (!ok) return
    const cred = await leerCredencialLogin()
    if (!cred) {
      setError('No hay credenciales guardadas. Ingresa con tu clave una vez.')
      setHuellaLista(false)
      return
    }
    setIdentificador(cred.identificador)
    setPassword(cred.password)
    await hacerLogin(cred.identificador, cred.password)
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

        {huellaLista ? (
          <Pressable
            onPress={ingresarConHuella}
            disabled={enviando}
            style={({ pressed }) => [est.huellaBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={est.huellaIcono}>👆</Text>
            <Text style={est.huellaTexto}>Ingresar con {bioTipo}</Text>
          </Pressable>
        ) : null}

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
  huellaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: color.primary,
    backgroundColor: color.primaryLight,
  },
  huellaIcono: { fontSize: 18 },
  huellaTexto: { fontSize: 14, fontWeight: '800', color: color.primaryDark, textTransform: 'capitalize' },
  titulo: { fontSize: 23, fontWeight: '800', color: color.text, letterSpacing: -0.4, textAlign: 'center' },
  parrafo: { fontSize: 13, color: color.text2, marginTop: 6, marginBottom: 26, textAlign: 'center', lineHeight: 19 },
  olvido: { fontSize: 12.5, fontWeight: '600', color: color.primary },
  proveedores: { marginTop: 40, alignItems: 'center' },
  proveedoresTitulo: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: color.text4, marginBottom: 12 },
  proveedoresFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, flexWrap: 'wrap' },
  provLogo: { width: 74, height: 34, resizeMode: 'contain', opacity: 0.85 },
  pie: { marginTop: 30, fontSize: 11, color: color.text4, textAlign: 'center' },
})
