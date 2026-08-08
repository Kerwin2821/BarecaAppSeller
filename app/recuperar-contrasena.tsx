import { useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { authApi } from '@/lib/endpoints'
import { mensajeDeError } from '@/lib/api'
import { MedidorClave, fuerzaClave } from '@/components/MedidorClave'
import { Alerta, Boton, Campo, Tarjeta } from '@/components/Ui'
import { color } from '@/lib/tema'

type Paso = 'correo' | 'otp' | 'nueva'

/** Recuperación de contraseña por OTP al correo (passwords/v2 del BFF). */
export default function RecuperarContrasena() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [paso, setPaso] = useState<Paso>('correo')
  const [correo, setCorreo] = useState('')
  const [otp, setOtp] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
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

  const validarOtp = async () => {
    if (enviando) return
    if (otp.trim().length < 4) {
      setError('Ingrese el código recibido.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await authApi.validarOtpRecovery(correo.trim(), otp.trim())
      setOk(null)
      setPaso('nueva')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const guardarNueva = async () => {
    if (enviando) return
    if (nueva.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva !== confirmacion) {
      setError('La confirmación no coincide.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      // El flujo v2 valida el OTP y habilita el cambio; reutilizamos el endpoint
      // de actualización con el correo como identificador.
      await authApi.actualizarPass({ loginId: correo.trim(), passNueva: nueva })
      router.replace('/login')
    } catch (e) {
      setError(mensajeDeError(e))
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
                ? 'Ingresa el código que enviamos a tu correo.'
                : 'Crea tu nueva contraseña.'}
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
              value={otp}
              onChangeText={(t) => {
                setOtp(t)
                setError(null)
              }}
              style={{ marginTop: 14 }}
            />
          ) : null}

          {paso === 'nueva' ? (
            <>
              <Campo
                etiqueta="Nueva contraseña"
                placeholder="Mínimo 8 caracteres"
                secureTextEntry
                value={nueva}
                onChangeText={(t) => {
                  setNueva(t)
                  setError(null)
                }}
                style={{ marginTop: 14 }}
              />
              <MedidorClave clave={nueva} />
              <Campo
                etiqueta="Confirme la contraseña"
                placeholder="Repita la contraseña"
                secureTextEntry
                value={confirmacion}
                onChangeText={(t) => {
                  setConfirmacion(t)
                  setError(null)
                }}
                style={{ marginTop: 14 }}
              />
            </>
          ) : null}

          {error ? (
            <View style={{ marginTop: 14 }}>
              <Alerta tipo="error">{error}</Alerta>
            </View>
          ) : null}

          <Boton
            texto={
              enviando
                ? 'Procesando…'
                : paso === 'correo'
                  ? 'Enviar código'
                  : paso === 'otp'
                    ? 'Validar código'
                    : 'Guardar contraseña'
            }
            onPress={paso === 'correo' ? pedirOtp : paso === 'otp' ? validarOtp : guardarNueva}
            cargando={enviando}
            disabled={paso === 'nueva' && (nueva.length < 8 || fuerzaClave(nueva) < 2)}
            style={{ marginTop: 20, paddingVertical: 13 }}
          />
          <Pressable onPress={() => router.replace('/login')} style={{ marginTop: 14, alignSelf: 'center' }}>
            <Text style={est.volver}>Volver al inicio de sesión</Text>
          </Pressable>
        </Tarjeta>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const est = StyleSheet.create({
  logo: { width: 150, height: 60, resizeMode: 'contain', alignSelf: 'center', marginBottom: 18 },
  titulo: { fontSize: 18, fontWeight: '800', color: color.text },
  sub: { fontSize: 12.5, color: color.text2, marginTop: 4, lineHeight: 18 },
  volver: { fontSize: 12, fontWeight: '600', color: color.primary },
})
