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
import { IcoHuella } from '@/components/Iconos'
import { color } from '@/lib/tema'

// Logos a color (el de Caroní es blanco, para fondo oscuro, así que no va aquí).
const PROVEEDORES = [
  require('../assets/logos/logo-estar-seguros.png'),
  require('../assets/logos/logo-laoccidental.png'),
]
const BECA = require('../assets/racha-feliz.png')

export default function Login() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { iniciarSesion, avisoCierre, limpiarAviso } = useAuth()

  const [identificador, setIdentificador] = useState('')
  const [password, setPassword] = useState('')
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

  /** Realiza el login con las credenciales dadas (el BFF ya no exige captcha). */
  const hacerLogin = async (id: string, pass: string) => {
    setEnviando(true)
    setError(null)
    limpiarAviso()
    try {
      const { requiereCambio } = await iniciarSesion({
        identificador: id.trim(),
        password: pass,
        turnstileToken: '',
      })
      // Si la huella YA está activa, mantén la credencial guardada al día con la
      // clave recién usada: así, si el usuario cambió su contraseña (p.ej. en la
      // web), el próximo ingreso con huella no falla con "password inválido".
      if (!requiereCambio && (await biometriaHabilitada())) {
        await guardarCredencialLogin({ identificador: id.trim(), password: pass })
      }
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.white }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={est.decor} pointerEvents="none">
        <View style={est.blobNaranja} />
        <View style={est.blobNavy} />
      </View>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30, paddingHorizontal: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <Image source={require('../assets/logo-bareca.png')} style={est.logo} />
        <Text style={est.parrafo}>Ingrese sus credenciales para cotizar y emitir pólizas.</Text>

        {avisoCierre ? (
          <View style={{ marginBottom: 16 }}>
            <Alerta tipo="info">{avisoCierre}</Alerta>
          </View>
        ) : null}

        <Image source={BECA} style={est.beca} resizeMode="contain" />

        <View style={est.formCard}>
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
            style={{ marginBottom: 14 }}
          />
          <Campo
            etiqueta="Contraseña"
            placeholder="••••••••••"
            revelable
            value={password}
            error={!!error}
            onChangeText={(t) => {
              setPassword(t)
              setError(null)
            }}
            onSubmitEditing={enviar}
            returnKeyType="go"
          />
        </View>

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
          <>
            <View style={est.divisor}>
              <View style={est.divisorLinea} />
              <Text style={est.divisorTxt}>o</Text>
              <View style={est.divisorLinea} />
            </View>
            <Pressable
              onPress={ingresarConHuella}
              disabled={enviando}
              style={({ pressed }) => [est.huellaBtn, pressed && { opacity: 0.7 }]}
            >
              <IcoHuella color={color.primary} size={22} />
              <Text style={est.huellaTexto}>Ingreso biométrico</Text>
            </Pressable>
          </>
        ) : null}

        <Pressable onPress={() => router.push('/recuperar-contrasena')} style={{ marginTop: 16, alignSelf: 'center' }}>
          <Text style={est.olvido}>¿Olvidaste tu contraseña?</Text>
        </Pressable>

        <View style={est.pieBloque}>
          <Text style={est.portalPie}>Portal de Vendedores</Text>
        </View>

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
  logo: { width: 212, height: 66, resizeMode: 'contain', alignSelf: 'center', marginBottom: 20 },
  decor: { ...StyleSheet.absoluteFillObject },
  blobNaranja: { position: 'absolute', top: -130, right: -110, width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(241,89,42,0.13)' },
  blobNavy: { position: 'absolute', bottom: -130, left: -120, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(42,47,107,0.09)' },
  formCard: {
    backgroundColor: '#F1F4FB',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.borderSoft,
    padding: 18,
    shadowColor: '#1C2150',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  huellaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.primary,
    backgroundColor: color.primaryLight,
  },
  huellaTexto: { fontSize: 14, fontWeight: '800', color: color.primaryDark },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  divisorLinea: { flex: 1, height: 1, backgroundColor: color.borderSoft },
  divisorTxt: { fontSize: 11.5, fontWeight: '700', color: color.text4 },
  parrafo: { fontSize: 13, color: color.text2, marginTop: 6, marginBottom: 20, textAlign: 'center', lineHeight: 19 },
  olvido: { fontSize: 12.5, fontWeight: '600', color: color.primary },
  pieBloque: { alignItems: 'center', marginTop: 34 },
  beca: { width: 120, height: 92, alignSelf: 'center', marginTop: 16, marginBottom: -6, transform: [{ translateX: 40 }] },
  portalPie: { fontSize: 13, fontWeight: '800', color: color.primary, textAlign: 'center', marginTop: 2 },
  proveedores: { marginTop: 40, alignItems: 'center' },
  proveedoresTitulo: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: color.text4, marginBottom: 12 },
  proveedoresFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, flexWrap: 'wrap' },
  provLogo: { width: 74, height: 34, resizeMode: 'contain', opacity: 0.85 },
  pie: { marginTop: 30, fontSize: 11, color: color.text4, textAlign: 'center' },
})
