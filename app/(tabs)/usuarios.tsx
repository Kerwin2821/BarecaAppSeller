import { useCallback, useEffect, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { api, mensajeDeError } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { useAuth } from '@/lib/auth'
import { etiquetaRol, fechaRelativa, iniciales } from '@/lib/formato'
import type { Rol, UsuarioPortal } from '@/lib/tipos'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { CargandoBloque, EstadoError, EstadoVacio } from '@/components/Estados'
import { Alerta, Avatar, Boton, Campo, Chip, Tarjeta } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

/** Selector de rol con las mismas descripciones del portal. */
function SelectorRol({ valor, onCambiar }: { valor: Rol; onCambiar: (r: Rol) => void }) {
  const opciones: { rol: Rol; texto: string }[] = [
    { rol: 'OPERADOR', texto: 'Operador — dashboard, mapa e inspecciones' },
    { rol: 'ADMIN', texto: 'Administrador — además gestiona usuarios' },
  ]
  return (
    <View style={{ gap: 8 }}>
      {opciones.map((o) => {
        const activo = valor === o.rol
        return (
          <Pressable
            key={o.rol}
            onPress={() => onCambiar(o.rol)}
            style={[est.opcionRol, activo && { borderColor: color.orange, backgroundColor: color.orangeGhost }]}
          >
            <View style={[est.radio, activo && { borderColor: color.orange }]}>
              {activo && <View style={est.radioPunto} />}
            </View>
            <Text style={{ fontSize: 12, color: activo ? color.navy : color.text2, flex: 1 }}>{o.texto}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export default function Usuarios() {
  const { admin } = useAuth()
  const { avisar } = useToast()

  const cargar = useCallback((signal: AbortSignal) => api.usuarios(signal), [])
  const { datos, cargando, error, recargar } = useApi<UsuarioPortal[]>(cargar)

  const [crearAbierto, setCrearAbierto] = useState(false)
  const [editando, setEditando] = useState<UsuarioPortal | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const lista = datos ?? []

  const reenviar = async (u: UsuarioPortal) => {
    setOcupado(`reset-${u.id}`)
    try {
      await api.resetClave(u.id)
      avisar(`Clave temporal enviada a ${u.email}`, 'ok')
      recargar()
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    } finally {
      setOcupado(null)
    }
  }

  const alternarActivo = async (u: UsuarioPortal) => {
    setOcupado(`estado-${u.id}`)
    try {
      if (u.activo) {
        await api.desactivarUsuario(u.id)
        avisar(`${u.nombre} quedó sin acceso al portal`, 'info')
      } else {
        await api.editarUsuario(u.id, { activo: true })
        avisar(`${u.nombre} fue reactivado`, 'ok')
      }
      recargar()
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: color.bgApp }}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={recargar} tintColor={color.orange} />}
      >
        <View style={est.top}>
          <Text style={{ flex: 1, fontSize: 12, color: color.text2 }}>
            {cargando ? 'Consultando accesos…' : `${lista.length} usuario(s) con acceso al portal BARECA`}
          </Text>
          <Boton texto="+ Crear Usuario" onPress={() => setCrearAbierto(true)} />
        </View>

        {error ? (
          <EstadoError mensaje={error} onReintentar={recargar} />
        ) : cargando ? (
          <Tarjeta>
            <CargandoBloque texto="Cargando usuarios…" />
          </Tarjeta>
        ) : lista.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              titulo="Sin usuarios registrados"
              detalle="Cree el primer acceso al portal para su equipo."
              accion={<Boton texto="+ Crear Usuario" onPress={() => setCrearAbierto(true)} />}
            />
          </Tarjeta>
        ) : (
          <View style={{ gap: 12 }}>
            {lista.map((u) => {
              const esYo = u.id === admin?.id
              return (
                <Tarjeta key={u.id} style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                    <Avatar texto={iniciales(u.nombre)} size={34} invertido={esYo} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '700', color: color.text }} numberOfLines={1}>
                        {u.nombre}
                      </Text>
                      <Text style={{ fontSize: 11, color: color.navy, fontFamily: fuenteMono }} numberOfLines={1}>
                        {u.usuario} · {u.email}
                      </Text>
                    </View>
                    <Chip
                      texto={etiquetaRol(u.rol)}
                      fondo={u.rol === 'ADMIN' ? color.navyTint : color.successBg}
                      colorTexto={u.rol === 'ADMIN' ? color.navy : color.success}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
                    <View style={[est.puntoEstado, { backgroundColor: u.activo ? color.success : '#CBD5E1' }]} />
                    <Text style={{ fontSize: 11.5, color: color.text }}>{u.activo ? 'Activo' : 'Inactivo'}</Text>
                    <Text style={{ fontSize: 11, color: color.text3 }}>
                      · Último acceso: {fechaRelativa(u.ultimoAcceso)}
                    </Text>
                  </View>
                  {u.debeCambiarClave ? (
                    <Text style={{ fontSize: 10.5, fontWeight: '600', color: color.amber, marginTop: 4 }}>
                      clave temporal pendiente
                    </Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <Boton texto="Editar" variante="mini" onPress={() => setEditando(u)} />
                    <Boton
                      texto={ocupado === `reset-${u.id}` ? '…' : 'Reenviar clave'}
                      variante="mini"
                      disabled={ocupado === `reset-${u.id}`}
                      onPress={() => reenviar(u)}
                    />
                    <Boton
                      texto={ocupado === `estado-${u.id}` ? '…' : u.activo ? 'Desactivar' : 'Activar'}
                      variante={u.activo ? 'peligro' : 'mini'}
                      disabled={esYo || ocupado === `estado-${u.id}`}
                      onPress={() => alternarActivo(u)}
                    />
                  </View>
                </Tarjeta>
              )
            })}
          </View>
        )}
      </ScrollView>

      <ModalCrear
        abierto={crearAbierto}
        onCerrar={() => setCrearAbierto(false)}
        onListo={() => {
          setCrearAbierto(false)
          recargar()
        }}
      />

      <ModalEditar
        usuario={editando}
        onCerrar={() => setEditando(null)}
        onListo={() => {
          setEditando(null)
          recargar()
        }}
      />
    </>
  )
}

/* ══════════════════════════════════════════════════════════
   Modal: crear usuario
   ══════════════════════════════════════════════════════════ */

function ModalCrear({
  abierto,
  onCerrar,
  onListo,
}: {
  abierto: boolean
  onCerrar: () => void
  onListo: () => void
}) {
  const { avisar } = useToast()
  const [usuario, setUsuario] = useState('')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<Rol>('OPERADOR')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (abierto) {
      setUsuario('')
      setNombre('')
      setEmail('')
      setRol('OPERADOR')
      setError(null)
      setEnviando(false)
    }
  }, [abierto])

  const enviar = async () => {
    if (enviando) return
    if (!usuario.trim() || !nombre.trim()) {
      setError('Complete el usuario y el nombre.')
      return
    }
    if (!/.+@.+\..+/.test(email)) {
      setError('Ingrese un email válido: allí se enviará la clave temporal.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await api.crearUsuario({ usuario: usuario.trim(), nombre: nombre.trim(), email: email.trim(), rol })
      avisar(`Clave temporal enviada a ${email.trim()}`, 'ok')
      onListo()
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Crear Usuario"
      subtitulo="Se generará una clave temporal aleatoria y se enviará por correo"
    >
      <Campo
        etiqueta="Usuario"
        placeholder="Ej. l.medina"
        autoCapitalize="none"
        autoCorrect={false}
        value={usuario}
        onChangeText={(t) => {
          setUsuario(t)
          setError(null)
        }}
        style={{ marginBottom: 14 }}
      />
      <Campo
        etiqueta="Nombre completo"
        placeholder="Ej. Laura Medina"
        value={nombre}
        onChangeText={(t) => {
          setNombre(t)
          setError(null)
        }}
        style={{ marginBottom: 14 }}
      />
      <Campo
        etiqueta="Email"
        placeholder="usuario@bareca.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={(t) => {
          setEmail(t)
          setError(null)
        }}
        style={{ marginBottom: 14 }}
      />
      <Text style={est.etiquetaRol}>Rol</Text>
      <SelectorRol valor={rol} onCambiar={setRol} />

      <View style={{ marginTop: 16 }}>
        <Alerta tipo="info">
          Se enviará una clave temporal a su correo. El usuario deberá cambiarla en su primer inicio de
          sesión.
        </Alerta>
      </View>

      {error ? (
        <View style={{ marginTop: 12 }}>
          <Alerta tipo="error">{error}</Alerta>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        <Boton texto="Cancelar" variante="soft" onPress={onCerrar} style={{ flex: 1 }} />
        <Boton
          texto={enviando ? 'Creando…' : 'Crear y Enviar Clave ✉'}
          onPress={enviar}
          cargando={enviando}
          style={{ flex: 1.6 }}
        />
      </View>
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════════
   Modal: editar usuario
   ══════════════════════════════════════════════════════════ */

function ModalEditar({
  usuario,
  onCerrar,
  onListo,
}: {
  usuario: UsuarioPortal | null
  onCerrar: () => void
  onListo: () => void
}) {
  const { avisar } = useToast()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<Rol>('OPERADOR')
  const [activo, setActivo] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (usuario) {
      setNombre(usuario.nombre)
      setEmail(usuario.email)
      setRol(usuario.rol)
      setActivo(usuario.activo)
      setError(null)
      setEnviando(false)
    }
  }, [usuario])

  if (!usuario) return null

  const enviar = async () => {
    if (enviando) return
    if (!nombre.trim()) {
      setError('El nombre no puede quedar vacío.')
      return
    }
    if (!/.+@.+\..+/.test(email)) {
      setError('Ingrese un email válido.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await api.editarUsuario(usuario.id, { nombre: nombre.trim(), email: email.trim(), rol, activo })
      avisar('Usuario actualizado', 'ok')
      onListo()
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Editar Usuario" subtitulo={`Acceso de ${usuario.usuario}`}>
      <Campo
        etiqueta="Nombre completo"
        value={nombre}
        onChangeText={(t) => {
          setNombre(t)
          setError(null)
        }}
        style={{ marginBottom: 14 }}
      />
      <Campo
        etiqueta="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={(t) => {
          setEmail(t)
          setError(null)
        }}
        style={{ marginBottom: 14 }}
      />
      <Text style={est.etiquetaRol}>Rol</Text>
      <SelectorRol valor={rol} onCambiar={setRol} />

      <View style={est.cajaActivo}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: color.text }}>Acceso activo</Text>
          <Text style={{ fontSize: 11, color: color.text2, marginTop: 1 }}>
            Al desactivar, el usuario no podrá iniciar sesión
          </Text>
        </View>
        <Switch
          value={activo}
          onValueChange={setActivo}
          trackColor={{ true: color.orange, false: '#CBD5E1' }}
          thumbColor="#FFFFFF"
        />
      </View>

      {error ? (
        <View style={{ marginTop: 12 }}>
          <Alerta tipo="error">{error}</Alerta>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        <Boton texto="Cancelar" variante="soft" onPress={onCerrar} style={{ flex: 1 }} />
        <Boton
          texto={enviando ? 'Guardando…' : 'Guardar cambios'}
          onPress={enviar}
          cargando={enviando}
          style={{ flex: 1.6 }}
        />
      </View>
    </Modal>
  )
}

const est = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  puntoEstado: { width: 8, height: 8, borderRadius: 99 },
  etiquetaRol: { fontSize: 12, fontWeight: '700', color: color.text, marginBottom: 8 },
  opcionRol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: color.borderInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioPunto: { width: 9, height: 9, borderRadius: 99, backgroundColor: color.orange },
  cajaActivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    backgroundColor: color.bgCard,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
})
