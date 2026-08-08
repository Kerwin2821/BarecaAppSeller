import { useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/lib/auth'
import { mensajeDeError } from '@/lib/api'
import { Alerta, Boton, Campo } from '@/components/Ui'
import { color, fuenteMono, radio } from '@/lib/tema'

/**
 * Datos del panel de marca: son atributos del producto documentados
 * (8 tomas esenciales, sesión de 15 min), no métricas de operación.
 */
const DESTACADOS = [
  { valor: '360°', nota: 'cobertura del vehículo' },
  { valor: '8 tomas', nota: 'evidencia esencial' },
  { valor: '15 min', nota: 'sesión segura' },
]

export default function Login() {
  const insets = useSafeAreaInsets()
  const { iniciarSesion, avisoCierre, limpiarAviso } = useAuth()

  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    if (enviando) return
    if (!usuario.trim() || !password) {
      setError('Ingrese su usuario y contraseña.')
      return
    }
    setEnviando(true)
    setError(null)
    limpiarAviso()
    try {
      await iniciarSesion(usuario.trim(), password)
      // La guardia del layout raíz redirige a "/" o a /cambiar-clave.
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: color.white }}
        contentContainerStyle={{
          paddingTop: insets.top + 34,
          paddingBottom: insets.bottom + 26,
          paddingHorizontal: 28,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Image source={require('../assets/logo-bareca.png')} style={est.logo} />

        <Text style={est.titulo}>Bienvenido al Portal</Text>
        <Text style={est.parrafo}>
          Ingrese sus credenciales para acceder al sistema de peritaje Winspec.
        </Text>

        {avisoCierre ? (
          <View style={{ marginBottom: 16 }}>
            <Alerta tipo="info">{avisoCierre}</Alerta>
          </View>
        ) : null}

        <Campo
          etiqueta="Usuario"
          placeholder="admin"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          value={usuario}
          error={!!error}
          onChangeText={(t) => {
            setUsuario(t)
            setError(null)
          }}
          style={{ marginBottom: 16 }}
        />

        <Campo
          etiqueta="Contraseña"
          placeholder="••••••••••"
          secureTextEntry
          autoComplete="current-password"
          value={password}
          error={!!error}
          onChangeText={(t) => {
            setPassword(t)
            setError(null)
          }}
          onSubmitEditing={enviar}
          returnKeyType="go"
        />

        {error ? (
          <View style={{ marginTop: 14 }}>
            <Alerta tipo="error">{error}</Alerta>
          </View>
        ) : null}

        <Boton
          texto={enviando ? 'Verificando…' : 'Iniciar Sesión →'}
          onPress={enviar}
          cargando={enviando}
          style={{ marginTop: 24, paddingVertical: 14 }}
        />

        {/* ── Panel de marca ─────────────────────────────── */}
        <View style={est.marco}>
          <Image source={require('../assets/login-1.png')} style={est.ilustracion} />
        </View>
        <Text style={est.marcaTitulo}>Peritaje vehicular inteligente</Text>
        <Text style={est.marcaTexto}>
          Inspecciones geolocalizadas, evidencia multimedia y criterio de asegurabilidad en tiempo
          real para su flota.
        </Text>

        <View style={est.destacados}>
          {DESTACADOS.map((d, i) => (
            <View key={d.valor} style={{ flexDirection: 'row', gap: 18 }}>
              {i > 0 && <View style={{ width: 1, backgroundColor: color.border }} />}
              <View style={{ alignItems: 'center' }}>
                <Text style={est.destacadoValor}>{d.valor}</Text>
                <Text style={est.destacadoNota}>{d.nota}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={est.pie}>
          © {new Date().getFullYear()} Bareca C.A. · Sistema Winspec de Inspección Vehicular
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const est = StyleSheet.create({
  logo: { height: 40, width: 150, resizeMode: 'contain', marginBottom: 30 },
  titulo: { fontSize: 24, fontWeight: '800', color: color.navy, letterSpacing: -0.4, marginBottom: 6 },
  parrafo: { fontSize: 13, color: color.text2, marginBottom: 26, lineHeight: 19 },
  marco: {
    marginTop: 38,
    backgroundColor: color.navyTint,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: radio.xl,
    padding: 22,
    alignItems: 'center',
  },
  ilustracion: { width: '86%', height: 190, resizeMode: 'contain' },
  marcaTitulo: {
    fontSize: 17,
    fontWeight: '800',
    color: color.navy,
    textAlign: 'center',
    marginTop: 20,
    letterSpacing: -0.2,
  },
  marcaTexto: {
    fontSize: 12.5,
    color: color.text2,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 5,
    paddingHorizontal: 8,
  },
  destacados: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    marginTop: 20,
  },
  destacadoValor: { fontSize: 16, fontWeight: '700', color: color.navy, fontFamily: fuenteMono },
  destacadoNota: { fontSize: 10, color: color.text3, marginTop: 2 },
  pie: { marginTop: 34, fontSize: 11, color: color.text3, textAlign: 'center' },
})
