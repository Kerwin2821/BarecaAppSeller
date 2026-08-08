import { useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/lib/auth'
import { authApi } from '@/lib/endpoints'
import { mensajeDeError } from '@/lib/api'
import { MedidorClave, fuerzaClave } from '@/components/MedidorClave'
import { Alerta, Boton, Campo, Tarjeta } from '@/components/Ui'
import { color } from '@/lib/tema'

/**
 * Cambio de clave obligatorio (primer ingreso o expirada). Tras actualizar, se
 * vuelve al login para iniciar sesión con la nueva contraseña (igual que el
 * portal, que hace logout y pide re-login).
 */
export default function CambiarClave() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { cambioClave, cerrarSesion } = useAuth()

  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    if (enviando || !cambioClave) return
    if (cambioClave.motivo === 'expired' && !actual) {
      setError('Ingrese su contraseña actual.')
      return
    }
    if (nueva.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva !== confirmacion) {
      setError('La confirmación no coincide con la nueva contraseña.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await authApi.actualizarPass({
        loginId: cambioClave.loginId,
        passActual: actual || undefined,
        passNueva: nueva,
      })
      await cerrarSesion()
      router.replace('/login')
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  const cancelar = async () => {
    await cerrarSesion()
    router.replace('/login')
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: color.bgApp }}
        contentContainerStyle={{ paddingTop: insets.top + 26, paddingBottom: insets.bottom + 26, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Image source={require('../assets/logo-bareca.png')} style={est.logo} />
        <Tarjeta style={{ padding: 22 }}>
          <Text style={est.titulo}>Actualiza tu contraseña</Text>
          <View style={{ marginTop: 14, marginBottom: 18 }}>
            <Alerta tipo="info">{cambioClave?.mensaje ?? 'Debes cambiar tu contraseña para continuar.'}</Alerta>
          </View>

          {cambioClave?.motivo === 'expired' ? (
            <Campo
              etiqueta="Contraseña actual"
              placeholder="••••••••••"
              secureTextEntry
              value={actual}
              onChangeText={(t) => {
                setActual(t)
                setError(null)
              }}
              style={{ marginBottom: 14 }}
            />
          ) : null}

          <Campo
            etiqueta="Nueva contraseña"
            placeholder="Mínimo 8 caracteres"
            secureTextEntry
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
            value={confirmacion}
            onChangeText={(t) => {
              setConfirmacion(t)
              setError(null)
            }}
            style={{ marginTop: 14 }}
          />

          {error ? (
            <View style={{ marginTop: 14 }}>
              <Alerta tipo="error">{error}</Alerta>
            </View>
          ) : null}

          <Boton
            texto={enviando ? 'Guardando…' : 'Cambiar contraseña'}
            onPress={enviar}
            cargando={enviando}
            disabled={nueva.length < 8 || fuerzaClave(nueva) < 2}
            style={{ marginTop: 20, paddingVertical: 13 }}
          />
          <Pressable onPress={cancelar} style={{ marginTop: 14, alignSelf: 'center' }}>
            <Text style={est.cancelar}>Cancelar e ir al inicio de sesión</Text>
          </Pressable>
        </Tarjeta>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const est = StyleSheet.create({
  logo: { width: 150, height: 60, resizeMode: 'contain', alignSelf: 'center', marginBottom: 18 },
  titulo: { fontSize: 18, fontWeight: '800', color: color.text },
  cancelar: { fontSize: 12, fontWeight: '600', color: color.text3 },
})
