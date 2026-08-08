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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/lib/auth'
import { mensajeDeError } from '@/lib/api'
import { MedidorClave, fuerzaClave } from '@/components/MedidorClave'
import { Alerta, Avatar, Boton, Campo, Tarjeta } from '@/components/Ui'
import { iniciales, reloj } from '@/lib/formato'
import { color, fuenteMono } from '@/lib/tema'

export default function CambiarClave() {
  const insets = useSafeAreaInsets()
  const { admin, restantes, cambiarClave, cerrarSesion } = useAuth()

  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    if (enviando) return
    if (!actual) {
      setError('Ingrese su clave temporal actual.')
      return
    }
    if (nueva.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva === actual) {
      setError('La nueva contraseña debe ser distinta de la actual.')
      return
    }
    if (nueva !== confirmacion) {
      setError('La confirmación no coincide con la nueva contraseña.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await cambiarClave(actual, nueva)
      // La guardia del layout raíz redirige al Dashboard.
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: color.bgApp }}
        contentContainerStyle={{
          paddingTop: insets.top + 26,
          paddingBottom: insets.bottom + 26,
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Image source={require('../assets/logo-bareca.png')} style={est.logo} />

        <Tarjeta style={{ padding: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Avatar texto={iniciales(admin?.nombre)} size={40} invertido />
            <View style={{ flex: 1 }}>
              <Text style={est.titulo}>Actualice su contraseña</Text>
              <Text style={est.subtitulo}>
                {admin?.nombre} · {admin?.usuario}
              </Text>
            </View>
          </View>

          <View style={{ marginBottom: 20 }}>
            <Alerta tipo="info">
              Su acceso fue creado con una clave temporal. Debe cambiarla antes de usar el portal.
            </Alerta>
          </View>

          <Campo
            etiqueta="Clave temporal actual"
            placeholder="••••••••••"
            secureTextEntry
            autoComplete="current-password"
            value={actual}
            onChangeText={(t) => {
              setActual(t)
              setError(null)
            }}
            style={{ marginBottom: 14 }}
          />

          <Campo
            etiqueta="Nueva contraseña"
            placeholder="Mínimo 8 caracteres"
            secureTextEntry
            autoComplete="new-password"
            value={nueva}
            onChangeText={(t) => {
              setNueva(t)
              setError(null)
            }}
          />
          <MedidorClave clave={nueva} />

          <Campo
            etiqueta="Confirme la nueva contraseña"
            placeholder="Repita la contraseña"
            secureTextEntry
            autoComplete="new-password"
            value={confirmacion}
            onChangeText={(t) => {
              setConfirmacion(t)
              setError(null)
            }}
            style={{ marginTop: 14 }}
          />
          {confirmacion.length > 0 && confirmacion !== nueva ? (
            <Text style={est.noCoincide}>Las contraseñas no coinciden.</Text>
          ) : null}

          {error ? (
            <View style={{ marginTop: 14 }}>
              <Alerta tipo="error">{error}</Alerta>
            </View>
          ) : null}

          <Boton
            texto={enviando ? 'Guardando…' : 'Cambiar contraseña y continuar'}
            onPress={enviar}
            cargando={enviando}
            disabled={nueva.length < 8 || fuerzaClave(nueva) < 2}
            style={{ marginTop: 20, paddingVertical: 13 }}
          />

          <View style={est.pieCard}>
            <Text style={est.expira}>Sesión expira en {reloj(restantes)}</Text>
            <Pressable onPress={cerrarSesion}>
              <Text style={est.salir}>Cerrar sesión</Text>
            </Pressable>
          </View>
        </Tarjeta>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const est = StyleSheet.create({
  logo: { height: 34, width: 130, resizeMode: 'contain', alignSelf: 'center', marginBottom: 20 },
  titulo: { fontSize: 17, fontWeight: '800', color: color.navy, letterSpacing: -0.2 },
  subtitulo: { fontSize: 11.5, color: color.text2, marginTop: 2 },
  noCoincide: { fontSize: 11, color: color.danger, marginTop: 6 },
  pieCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: color.borderRow,
  },
  expira: { fontSize: 11, color: color.text3, fontFamily: fuenteMono },
  salir: { fontSize: 11.5, fontWeight: '600', color: color.text2 },
})
