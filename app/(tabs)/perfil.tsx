import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { api, mensajeDeError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { etiquetaRol, fechaHora, iniciales, reloj } from '@/lib/formato'
import { MedidorClave, fuerzaClave } from '@/components/MedidorClave'
import { useToast } from '@/components/Toast'
import { Alerta, Avatar, Boton, Campo, Tarjeta } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

/** Duración de la sesión según docs/API-ADMIN.md (15 minutos). */
const DURACION_SESION_S = 15 * 60

export default function Perfil() {
  const router = useRouter()
  const { admin, restantes, refrescarAdmin, cambiarClave, cerrarSesion } = useAuth()
  const { avisar } = useToast()

  const esAdmin = admin?.rol === 'ADMIN'

  const [nombre, setNombre] = useState(admin?.nombre ?? '')
  const [email, setEmail] = useState(admin?.email ?? '')
  const [guardando, setGuardando] = useState(false)
  const [errorDatos, setErrorDatos] = useState<string | null>(null)

  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [cambiando, setCambiando] = useState(false)
  const [errorClave, setErrorClave] = useState<string | null>(null)

  useEffect(() => {
    if (admin) {
      setNombre(admin.nombre)
      setEmail(admin.email)
    }
  }, [admin])

  const guardarDatos = async () => {
    if (!admin || guardando) return
    if (!nombre.trim()) {
      setErrorDatos('El nombre no puede quedar vacío.')
      return
    }
    if (!/.+@.+\..+/.test(email)) {
      setErrorDatos('Ingrese un email válido.')
      return
    }
    setGuardando(true)
    setErrorDatos(null)
    try {
      await api.editarUsuario(admin.id, { nombre: nombre.trim(), email: email.trim() })
      await refrescarAdmin()
      avisar('Perfil actualizado correctamente', 'ok')
    } catch (err) {
      setErrorDatos(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }

  const guardarClave = async () => {
    if (cambiando) return
    if (!actual) {
      setErrorClave('Ingrese su contraseña actual.')
      return
    }
    if (nueva.length < 8) {
      setErrorClave('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva !== confirmacion) {
      setErrorClave('La confirmación no coincide con la nueva contraseña.')
      return
    }
    setCambiando(true)
    setErrorClave(null)
    try {
      await cambiarClave(actual, nueva)
      setActual('')
      setNueva('')
      setConfirmacion('')
      avisar('Contraseña actualizada', 'ok')
    } catch (err) {
      setErrorClave(mensajeDeError(err))
    } finally {
      setCambiando(false)
    }
  }

  const salir = async () => {
    await cerrarSesion()
    router.replace('/login')
  }

  const colorReloj = restantes < 60 ? color.danger : restantes < 180 ? color.amber : color.navy
  const pctSesion = Math.max(0, Math.min(100, (restantes / DURACION_SESION_S) * 100))

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: color.bgApp }}
        contentContainerStyle={{ padding: 16, paddingBottom: 34 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Datos personales ──────────────────────────────── */}
        <Tarjeta style={{ padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 20 }}>
            <Avatar texto={iniciales(admin?.nombre)} size={50} invertido />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '800', color: color.navy }}>
                {admin?.nombre ?? '—'}
              </Text>
              <Text style={{ fontSize: 11.5, color: color.text2, marginTop: 1 }}>
                {etiquetaRol(admin?.rol)} · Bareca C.A.
              </Text>
            </View>
          </View>

          <Campo etiqueta="Usuario" value={admin?.usuario ?? ''} editable={false} mono style={{ marginBottom: 14 }} />
          <Campo
            etiqueta="Nombre completo"
            value={nombre}
            editable={esAdmin}
            onChangeText={(t) => {
              setNombre(t)
              setErrorDatos(null)
            }}
            style={{ marginBottom: 14 }}
          />
          <Campo
            etiqueta="Email corporativo"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            editable={esAdmin}
            onChangeText={(t) => {
              setEmail(t)
              setErrorDatos(null)
            }}
            style={{ marginBottom: 14 }}
          />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Campo etiqueta="Rol" value={etiquetaRol(admin?.rol)} editable={false} style={{ flex: 1 }} />
            <Campo etiqueta="Último acceso" value={fechaHora(admin?.ultimoAcceso)} editable={false} style={{ flex: 1 }} />
          </View>

          {errorDatos ? (
            <View style={{ marginTop: 14 }}>
              <Alerta tipo="error">{errorDatos}</Alerta>
            </View>
          ) : null}

          {esAdmin ? (
            <Boton
              texto={guardando ? 'Guardando…' : 'Guardar cambios'}
              onPress={guardarDatos}
              cargando={guardando}
              style={{ marginTop: 18, alignSelf: 'flex-start', paddingHorizontal: 22 }}
            />
          ) : (
            <View style={{ marginTop: 16 }}>
              <Alerta tipo="info">
                Solo un administrador puede modificar estos datos. Contacte a su administrador si
                necesita actualizarlos.
              </Alerta>
            </View>
          )}
        </Tarjeta>

        {/* ── Seguridad ─────────────────────────────────────── */}
        <Tarjeta style={{ padding: 20, marginTop: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: color.navy }}>Seguridad</Text>
          <Text style={{ fontSize: 11.5, color: color.text2, marginTop: 2, marginBottom: 18 }}>
            Actualice su contraseña de acceso al portal
          </Text>

          <Campo
            etiqueta="Contraseña actual"
            placeholder="••••••••••"
            secureTextEntry
            autoComplete="current-password"
            value={actual}
            onChangeText={(t) => {
              setActual(t)
              setErrorClave(null)
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
              setErrorClave(null)
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
              setErrorClave(null)
            }}
            style={{ marginTop: 14 }}
          />

          {errorClave ? (
            <View style={{ marginTop: 14 }}>
              <Alerta tipo="error">{errorClave}</Alerta>
            </View>
          ) : null}

          <Boton
            texto={cambiando ? 'Actualizando…' : 'Actualizar contraseña'}
            variante="navy"
            onPress={guardarClave}
            cargando={cambiando}
            disabled={nueva.length < 8 || fuerzaClave(nueva) < 2}
            style={{ marginTop: 18, alignSelf: 'flex-start', paddingHorizontal: 22 }}
          />
        </Tarjeta>

        {/* ── Sesión (tarjeta lateral del portal) ───────────── */}
        <Tarjeta style={{ padding: 16, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: color.text2 }}>Sesión expira en</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colorReloj, fontFamily: fuenteMono }}>
              {reloj(restantes)}
            </Text>
          </View>
          <View style={est.barraSesionFondo}>
            <View style={[est.barraSesion, { width: `${pctSesion}%`, backgroundColor: colorReloj }]} />
          </View>
          <Boton texto="Cerrar sesión" variante="peligro" onPress={salir} style={{ marginTop: 14 }} />
        </Tarjeta>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const est = StyleSheet.create({
  barraSesionFondo: { height: 4, backgroundColor: '#E2E8F0', borderRadius: 99, overflow: 'hidden' },
  barraSesion: { height: '100%', borderRadius: 99 },
})
