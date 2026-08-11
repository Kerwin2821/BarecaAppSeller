import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as ImagePicker from 'expo-image-picker'
import QRCode from 'react-native-qrcode-svg'
import { useAuth } from '@/lib/auth'
import { authApi, paymentApi, userApi } from '@/lib/endpoints'
import { PORTAL_CLIENTE_URL, mensajeDeError } from '@/lib/api'
import { actorUuid, etiquetaRol } from '@/lib/roles'
import { iniciales } from '@/lib/formato'
import type { UserRole } from '@/lib/tipos'
import {
  autenticarBiometria,
  biometriaDisponible,
  biometriaHabilitada,
  borrarCredencialLogin,
  setBiometriaHabilitada,
  tipoBiometria,
} from '@/lib/biometria'
import { useToast } from '@/components/Toast'
import { Modal } from '@/components/Modal'
import { Dropdown, type OpcionDrop } from '@/components/Dropdown'
import { Pantalla } from '@/components/Pantalla'
import { Alerta, Avatar, Boton, Campo, Tarjeta, TituloSeccion } from '@/components/Ui'
import { color } from '@/lib/tema'

type Tab = 'info' | 'seguridad' | 'pagos' | 'referido'

function Dato({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <View style={est.dato}>
      <Text style={est.datoEtiqueta}>{etiqueta}</Text>
      <Text style={est.datoValor}>{valor || '—'}</Text>
    </View>
  )
}

export default function Perfil() {
  const router = useRouter()
  const { user, cerrarSesion } = useAuth()
  const { avisar } = useToast()
  const nombre = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Vendedor'

  // Pestañas visibles por rol (como la web: Pagos oculto a BARECA; Referido solo DISTRIBUIDOR/KIOSCO).
  const tabs = useMemo(() => {
    const t: { id: Tab; label: string }[] = [
      { id: 'info', label: 'Información Personal' },
      { id: 'seguridad', label: 'Seguridad' },
    ]
    if (user?.role !== 'BARECA') t.push({ id: 'pagos', label: 'Métodos de Pago' })
    if (user?.role === 'DISTRIBUIDOR' || user?.role === 'KIOSCO') t.push({ id: 'referido', label: 'Link Referido' })
    return t
  }, [user?.role])
  const [tab, setTab] = useState<Tab>('info')

  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  useEffect(() => {
    if (!user) return
    authApi
      .obtenerFoto(user.loginId)
      .then((r) => setFotoUrl((r as any)?.data?.url ?? null))
      .catch(() => setFotoUrl(null))
  }, [user])

  const cambiarFoto = async () => {
    if (!user || subiendoFoto) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      avisar('Necesito permiso para acceder a tus fotos.', 'error')
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 })
    if (res.canceled || !res.assets?.[0]) return
    const a = res.assets[0]
    setSubiendoFoto(true)
    try {
      const form = new FormData()
      form.append('file', { uri: a.uri, name: a.fileName ?? 'avatar.jpg', type: a.mimeType ?? 'image/jpeg' } as any)
      const r = await authApi.subirFoto(user.loginId, form)
      const url = (r as any)?.data
      setFotoUrl(typeof url === 'string' ? url : a.uri)
      avisar('Foto actualizada.', 'ok')
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    } finally {
      setSubiendoFoto(false)
    }
  }

  const salir = async () => {
    await cerrarSesion()
    router.replace('/login')
  }

  return (
    <Pantalla>
      {/* Cabecera con avatar */}
      <Tarjeta style={{ padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {fotoUrl ? (
            <Image source={{ uri: fotoUrl }} style={{ width: 54, height: 54, borderRadius: 27 }} />
          ) : (
            <Avatar texto={iniciales(nombre)} size={54} invertido />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={est.nombre}>{nombre}</Text>
            <Text style={est.rol}>
              {etiquetaRol(user?.role)}
              {user?.rolSecundario ? ` · ${user.rolSecundario}` : ''}
            </Text>
          </View>
        </View>
      </Tarjeta>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, marginBottom: 4 }} contentContainerStyle={{ gap: 6 }}>
        {tabs.map((t) => {
          const activo = tab === t.id
          return (
            <Pressable key={t.id} onPress={() => setTab(t.id)} style={[est.tab, activo && est.tabActivo]}>
              <Text style={{ fontSize: 12.5, fontWeight: activo ? '800' : '600', color: activo ? color.primaryDark : color.text3 }}>
                {t.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {tab === 'info' ? (
        <View>
          <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
            <Boton
              texto={subiendoFoto ? 'Subiendo…' : 'Cambiar foto'}
              variante="soft"
              cargando={subiendoFoto}
              onPress={cambiarFoto}
            />
          </View>
          <TituloSeccion>Datos de la cuenta</TituloSeccion>
          <Tarjeta style={{ padding: 16 }}>
            <Dato etiqueta="Nombre" valor={nombre} />
            <Dato etiqueta="Correo" valor={user?.email} />
            <Dato etiqueta="Teléfono" valor={user?.phone} />
            <Dato etiqueta="Rol" valor={etiquetaRol(user?.role)} />
            {user?.code ? <Dato etiqueta="Código" valor={user.code} /> : null}
            {user?.comisionPrepagada !== undefined ? (
              <Dato etiqueta="Comisión prepagada" valor={user.comisionPrepagada ? 'Sí' : 'No'} />
            ) : null}
          </Tarjeta>
        </View>
      ) : null}

      {tab === 'seguridad' ? <TabSeguridad /> : null}
      {tab === 'pagos' ? <TabPagos /> : null}
      {tab === 'referido' ? <TabReferido /> : null}

      <View style={{ marginTop: 22 }}>
        <Boton texto="Cerrar sesión" variante="peligro" onPress={salir} />
      </View>
    </Pantalla>
  )
}

/* ══════════════════ Seguridad (cambio de contraseña) ══════════════════ */
function TabSeguridad() {
  const { user } = useAuth()
  const { avisar } = useToast()

  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [duracionId, setDuracionId] = useState<string | null>(null)
  const [duraciones, setDuraciones] = useState<OpcionDrop[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [bioDisponible, setBioDisponible] = useState(false)
  const [bioHabilitada, setBioHabilitada] = useState(false)
  const [bioTipo, setBioTipo] = useState('Huella')

  useEffect(() => {
    authApi
      .fechasExpiraciones()
      .then((r) => {
        const arr = (Array.isArray(r) ? r : (r as any)?.data ?? []) as { id: number; dias: number; activo: boolean }[]
        setDuraciones(
          arr
            .filter((e) => e.activo && e.dias !== 1)
            .map((e) => ({ valor: String(e.id), texto: `${e.dias} días` })),
        )
      })
      .catch(() => setDuraciones([]))
  }, [])

  useEffect(() => {
    ;(async () => {
      setBioDisponible(await biometriaDisponible())
      setBioHabilitada(await biometriaHabilitada())
      setBioTipo(await tipoBiometria())
    })()
  }, [])

  const alternarBio = async (v: boolean) => {
    if (v) {
      const ok = await autenticarBiometria(`Activar desbloqueo con ${bioTipo.toLowerCase()}`)
      if (!ok) return
      await setBiometriaHabilitada(true)
      setBioHabilitada(true)
      avisar(`Desbloqueo con ${bioTipo.toLowerCase()} activado`, 'ok')
    } else {
      await setBiometriaHabilitada(false)
      await borrarCredencialLogin()
      setBioHabilitada(false)
      avisar('Ingreso con huella desactivado', 'info')
    }
  }

  const guardar = async () => {
    if (guardando || !user) return
    if (nueva.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (!duracionId) {
      setError('Debe seleccionar una duración.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await authApi.cambiarPassPerfil({ loginId: user.loginId, pass: nueva, fechaExpiracionId: Number(duracionId) })
      avisar('Contraseña actualizada.', 'ok')
      setNueva('')
      setConfirmar('')
      setDuracionId(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <View style={{ marginTop: 8 }}>
      <TituloSeccion>Seguridad de la Cuenta</TituloSeccion>
      <Tarjeta style={{ padding: 16, gap: 14 }}>
        <Text style={est.ayuda}>Define una nueva contraseña y su duración.</Text>
        <Campo
          etiqueta="Nueva Contraseña"
          placeholder="Mínimo 8 caracteres"
          secureTextEntry
          autoCapitalize="none"
          value={nueva}
          onChangeText={setNueva}
        />
        <Campo
          etiqueta="Confirmar Nueva Contraseña"
          placeholder="Repite la contraseña"
          secureTextEntry
          autoCapitalize="none"
          value={confirmar}
          onChangeText={setConfirmar}
          error={confirmar.length > 0 && confirmar !== nueva}
        />
        <Dropdown
          etiqueta="Duración de la Contraseña"
          placeholder="Seleccione una duración…"
          opciones={duraciones}
          valor={duracionId}
          onCambiar={setDuracionId}
        />
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        <Boton texto={guardando ? 'Guardando…' : 'Guardar Contraseña'} cargando={guardando} onPress={guardar} />
      </Tarjeta>

      <TituloSeccion>Acceso rápido</TituloSeccion>
      <Tarjeta style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: color.text }}>
              Desbloqueo con {bioTipo.toLowerCase()}
            </Text>
            <Text style={{ fontSize: 11.5, color: color.text2, marginTop: 2, lineHeight: 16 }}>
              {bioDisponible
                ? `Abre el app con tu ${bioTipo.toLowerCase()} mientras tu sesión siga activa.`
                : 'Configura una huella o rostro en los ajustes de tu teléfono para activar esta opción.'}
            </Text>
          </View>
          <Switch
            value={bioHabilitada}
            onValueChange={alternarBio}
            disabled={!bioDisponible}
            trackColor={{ true: color.primary, false: '#CBD5E1' }}
            thumbColor="#fff"
          />
        </View>
      </Tarjeta>
    </View>
  )
}

/* ══════════════════ Métodos de Pago (Pago Móvil) ══════════════════ */
function TabPagos() {
  const { user } = useAuth()
  const { avisar } = useToast()
  const [lista, setLista] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)

  const cargar = useCallback(async () => {
    if (!user) return
    const uuid = actorUuid(user)
    if (!uuid) {
      setCargando(false)
      return
    }
    setCargando(true)
    try {
      const r = await userApi.datosPagosByActor(user.role, uuid)
      setLista(((r as any)?.data ?? []) as any[])
    } catch {
      setLista([])
    } finally {
      setCargando(false)
    }
  }, [user])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TituloSeccion style={{ marginTop: 8 }}>Métodos de Retiro</TituloSeccion>
        <Boton texto="+ Añadir" variante="mini" onPress={() => setModal(true)} />
      </View>
      <Text style={[est.ayuda, { marginBottom: 10 }]}>Administra las cuentas donde recibirás tus comisiones.</Text>

      {cargando ? (
        <Tarjeta style={{ padding: 16 }}>
          <Text style={est.ayuda}>Cargando…</Text>
        </Tarjeta>
      ) : lista.length === 0 ? (
        <Tarjeta style={{ padding: 16 }}>
          <Text style={est.ayuda}>Aún no tienes métodos de retiro. Añade una cuenta de Pago Móvil.</Text>
        </Tarjeta>
      ) : (
        <View style={{ gap: 10 }}>
          {lista.map((p, i) => (
            <Tarjeta key={p?.datosPagosId ?? p?.id ?? i} style={{ padding: 16 }}>
              {p?.alias ? <Text style={est.pagoAlias}>{p.alias}</Text> : null}
              <Text style={est.pagoLinea}>
                {[p?.banco, p?.telefono].filter(Boolean).join(' · ')}
                {p?.numeroDocumento ? `  (${p.numeroDocumento})` : ''}
              </Text>
            </Tarjeta>
          ))}
        </View>
      )}

      <ModalAgregarPago
        abierto={modal}
        onCerrar={() => setModal(false)}
        onListo={() => {
          setModal(false)
          cargar()
        }}
      />
    </View>
  )
}

function ModalAgregarPago({
  abierto,
  onCerrar,
  onListo,
}: {
  abierto: boolean
  onCerrar: () => void
  onListo: () => void
}) {
  const { user } = useAuth()
  const { avisar } = useToast()
  const [bancos, setBancos] = useState<OpcionDrop[]>([])
  const [banco, setBanco] = useState<string | null>(null)
  const [alias, setAlias] = useState('')
  const [telefono, setTelefono] = useState('')
  const [documento, setDocumento] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setError(null)
    setAlias('')
    paymentApi
      .bancos()
      .then((r) => {
        const arr = ((r as any)?.data ?? []) as { codigo: string; nombre: string }[]
        setBancos(arr.map((b) => ({ valor: b.codigo, texto: `${b.codigo} · ${b.nombre}` })))
      })
      .catch(() => setBancos([]))
    // Prefill documento + teléfono del empleado (documento no editable, como la web).
    if (user) {
      userApi
        .empleadoByUuid(user.id)
        .then((emp: any) => {
          setDocumento(emp?.numeroDocumento ?? '')
        })
        .catch(() => setDocumento(''))
      setTelefono(user.phone ?? '')
    }
  }, [abierto, user])

  const enviar = async () => {
    if (enviando || !user) return
    const uuid = actorUuid(user) ?? ''
    if (!/^[a-zA-Z0-9]{1,20}$/.test(alias.trim())) {
      setError('El alias debe ser alfanumérico (máx. 20, sin espacios).')
      return
    }
    if (!banco) {
      setError('Selecciona el banco.')
      return
    }
    if (!/^04\d{9}$/.test(telefono.trim())) {
      setError('Teléfono inválido (ej: 04141234567).')
      return
    }
    if (!documento.trim()) {
      setError('No se encontró tu documento para asociar la cuenta.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const payload: Parameters<typeof userApi.crearDatosPago>[0] = {
        numeroDocumento: documento.trim(),
        telefono: telefono.trim(),
        alias: alias.trim(),
        banco,
        oficinasRegionalesId: null,
        distribuidoresId: null,
        kioscosPuestosId: null,
      }
      if (user.role === 'OFICINA_REGIONAL') payload.oficinasRegionalesId = uuid
      else if (user.role === 'DISTRIBUIDOR') payload.distribuidoresId = uuid
      else if (user.role === 'KIOSCO') payload.kioscosPuestosId = uuid
      await userApi.crearDatosPago(payload)
      avisar('Método de retiro agregado.', 'ok')
      onListo()
    } catch (e) {
      setError(mensajeDeError(e))
      setEnviando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nuevo método de retiro" subtitulo="Cuenta de Pago Móvil para tus comisiones">
      <View style={{ gap: 14 }}>
        <Dropdown etiqueta="Banco" placeholder="Selecciona el banco" opciones={bancos} valor={banco} onCambiar={setBanco} />
        <Campo etiqueta="Alias" placeholder="Ej: PrincipalBDV" value={alias} onChangeText={setAlias} autoCapitalize="none" />
        <Campo etiqueta="Teléfono" placeholder="04141234567" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} />
        <Campo etiqueta="Documento (RIF / Cédula)" value={documento} editable={false} />
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Boton texto="Cancelar" variante="soft" onPress={onCerrar} style={{ flex: 1 }} />
          <Boton texto={enviando ? 'Guardando…' : 'Guardar'} cargando={enviando} onPress={enviar} style={{ flex: 1.4 }} />
        </View>
      </View>
    </Modal>
  )
}

/* ══════════════════ Link Referido ══════════════════ */
function TabReferido() {
  const { user } = useAuth()
  const { avisar } = useToast()
  const [copiado, setCopiado] = useState(false)

  const link = useMemo(() => {
    if (!user?.code) return null
    const prefijo = user.role === 'DISTRIBUIDOR' ? 'D' : user.role === 'KIOSCO' ? 'K' : null
    if (!prefijo) return null
    return `${PORTAL_CLIENTE_URL}/generate-receipt?ref=${prefijo}-${user.code}`
  }, [user])

  const copiar = async () => {
    if (!link || copiado) return
    await Clipboard.setStringAsync(link)
    setCopiado(true)
    avisar('¡Enlace copiado al portapapeles!', 'ok')
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <View style={{ marginTop: 8 }}>
      <TituloSeccion>Enlace de Invitación</TituloSeccion>
      {!link ? (
        <Tarjeta style={{ padding: 16 }}>
          <Text style={est.ayuda}>Generando tu enlace de invitación…</Text>
        </Tarjeta>
      ) : (
        <Tarjeta style={{ padding: 20, alignItems: 'center', gap: 16 }}>
          <Text style={[est.ayuda, { textAlign: 'center' }]}>
            Comparte este enlace o QR con tus clientes para que coticen y compren asociados a ti.
          </Text>
          <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: color.borderSoft }}>
            <QRCode value={link} size={180} />
          </View>
          <View style={est.linkBox}>
            <Text style={est.linkTxt} numberOfLines={2}>
              {link}
            </Text>
          </View>
          <Boton texto={copiado ? '✓ Copiado' : 'Copiar enlace'} variante={copiado ? 'exito' : 'primary'} onPress={copiar} style={{ alignSelf: 'stretch' }} />
        </Tarjeta>
      )}
    </View>
  )
}

const est = StyleSheet.create({
  nombre: { fontSize: 17, fontWeight: '800', color: color.text },
  rol: { fontSize: 12, color: color.text2, marginTop: 2 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: color.borderSoft, backgroundColor: color.white },
  tabActivo: { backgroundColor: color.primaryLight, borderColor: color.primaryLight },
  dato: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.borderSoft, gap: 12 },
  datoEtiqueta: { fontSize: 12, color: color.text3 },
  datoValor: { fontSize: 12.5, fontWeight: '600', color: color.text, flexShrink: 1, textAlign: 'right' },
  ayuda: { fontSize: 12.5, color: color.text3, lineHeight: 18 },
  pagoAlias: { fontSize: 13.5, fontWeight: '800', color: color.primaryDark, marginBottom: 4 },
  pagoLinea: { fontSize: 12.5, color: color.text2 },
  linkBox: { alignSelf: 'stretch', backgroundColor: color.bgCard, borderRadius: 10, borderWidth: 1, borderColor: color.borderSoft, padding: 12 },
  linkTxt: { fontSize: 12, color: color.text2 },
})
