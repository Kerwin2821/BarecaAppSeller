import { useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { authApi } from '@/lib/endpoints'
import { mensajeDeError } from '@/lib/api'
import { Alerta, Boton, Campo, Tarjeta } from '@/components/Ui'
import { color } from '@/lib/tema'

type Paso = 'correo' | 'otp' | 'listo'

/**
 * Recuperación de contraseña por OTP al correo (passwords/v2 del BFF). Igual que
 * el portal web: correo → OTP. Al validar el OTP correctamente, el backend envía
 * las credenciales nuevas al correo del usuario (no se define una clave nueva en
 * la app). Por eso el flujo termina con un mensaje de éxito y vuelta al login.
 */
export default function RecuperarContrasena() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [paso, setPaso] = useState<Paso>('correo')
  const [correo, setCorreo] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const pedirOtp = async () => {
    if (enviando) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
      setError('Ingrese un correo válido.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await authApi.otpCambioPass(correo.trim())
      setOk('Te enviamos un código a tu correo.')
      setPaso('otp')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const validarOtp = async (codigo?: string) => {
    if (enviando) return
    const code = (codigo ?? otp).trim()
    if (code.length < 6) {
      setError('Ingrese el código de 6 dígitos.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await authApi.validarOtpRecovery(correo.trim(), code)
      setOk(null)
      setPaso('listo')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
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
          <Text style={est.titulo}>Recuperar contraseña</Text>
          <Text style={est.sub}>
            {paso === 'correo'
              ? 'Ingresa tu correo y te enviaremos un código.'
              : paso === 'otp'
                ? 'Ingresa el código de 6 dígitos que enviamos a tu correo.'
                : '¡Recuperación exitosa!'}
          </Text>

          {ok ? (
            <View style={{ marginTop: 14 }}>
              <Alerta tipo="exito">{ok}</Alerta>
            </View>
          ) : null}

          {paso === 'correo' ? (
            <Campo
              etiqueta="Correo"
              placeholder="correo@bareca.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={correo}
              onChangeText={(t) => {
                setCorreo(t)
                setError(null)
              }}
              style={{ marginTop: 14 }}
            />
          ) : null}

          {paso === 'otp' ? (
            <Campo
              etiqueta="Código"
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={(t) => {
                const digitos = t.replace(/\D/g, '').slice(0, 6)
                setOtp(digitos)
                setError(null)
                // Auto-valida al completar los 6 dígitos (sin tocar el botón).
                if (digitos.length === 6 && !enviando) void validarOtp(digitos)
              }}
              style={{ marginTop: 14 }}
            />
          ) : null}

          {paso === 'listo' ? (
            <View style={{ marginTop: 14 }}>
              <Alerta tipo="exito">
                Tus nuevas credenciales han sido enviadas a tu correo electrónico. Revísalo e inicia sesión con la contraseña nueva.
              </Alerta>
            </View>
          ) : null}

          {error ? (
            <View style={{ marginTop: 14 }}>
              <Alerta tipo="error">{error}</Alerta>
            </View>
          ) : null}

          {paso === 'listo' ? (
            <Boton
              texto="Ir al inicio de sesión"
              onPress={() => router.replace('/login')}
              style={{ marginTop: 20, paddingVertical: 13 }}
            />
          ) : (
            <Boton
              texto={enviando ? 'Procesando…' : paso === 'correo' ? 'Enviar código' : 'Validar código'}
              onPress={paso === 'correo' ? pedirOtp : () => validarOtp()}
              cargando={enviando}
              style={{ marginTop: 20, paddingVertical: 13 }}
            />
          )}
          <Pressable onPress={() => router.replace('/login')} style={{ marginTop: 14, alignSelf: 'center' }}>
            <Text style={est.volver}>Volver al inicio de sesión</Text>
          </Pressable>
        </Tarjeta>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const est = StyleSheet.create({
  logo: { width: 190, height: 60, resizeMode: 'contain', alignSelf: 'center', marginBottom: 18 },
  titulo: { fontSize: 18, fontWeight: '800', color: color.text },
  sub: { fontSize: 12.5, color: color.text2, marginTop: 4, lineHeight: 18 },
  volver: { fontSize: 12, fontWeight: '600', color: color.primary },
})
