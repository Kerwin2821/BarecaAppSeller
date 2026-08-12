import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { Image, Modal as RNModal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
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
  actualizarPasswordCredencial,
  autenticarBiometria,
  biometriaDisponible,
  biometriaHabilitada,
  borrarCredencialLogin,
  setBiometriaHabilitada,
  tipoBiometria,
} from '@/lib/biometria'
import { useToast } from '@/components/Toast'
import { MedidorClave } from '@/components/MedidorClave'
import { Modal } from '@/components/Modal'
import { Dropdown, type OpcionDrop } from '@/components/Dropdown'
import { LogoBanco } from '@/components/LogoBanco'
import { bancoInfo, BANCOS_VE } from '@/lib/bancos'
import { Pantalla } from '@/components/Pantalla'
import { Alerta, Avatar, Boton, Campo, Tarjeta, TituloSeccion } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

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
    if (user?.role !== 'BARECA') t.push({ id: 'pagos', label: 'Métodos de Cobro' })
    if (user?.role === 'DISTRIBUIDOR' || user?.role === 'KIOSCO') t.push({ id: 'referido', label: 'Link Referido' })
    return t
  }, [user?.role])
  const [tab, setTab] = useState<Tab>('info')

  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [verFoto, setVerFoto] = useState(false)
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
      {/* Visor de la foto de perfil ampliada (toca la imagen para abrir/cerrar) */}
      {fotoUrl ? (
        <RNModal visible={verFoto} transparent animationType="fade" onRequestClose={() => setVerFoto(false)}>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onPress={() => setVerFoto(false)}
          >
            <Image source={{ uri: fotoUrl }} style={{ width: '92%', height: '72%', borderRadius: 16 }} resizeMode="contain" />
            <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 16, fontSize: 12 }}>Toca para cerrar</Text>
          </Pressable>
        </RNModal>
      ) : null}
      {/* Cabecera con avatar */}
      <Tarjeta style={{ padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {fotoUrl ? (
            <Pressable onPress={() => setVerFoto(true)} hitSlop={6}>
              <Image source={{ uri: fotoUrl }} style={{ width: 54, height: 54, borderRadius: 27 }} />
            </Pressable>
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
    if (nueva.length < 8 || !/[A-ZÁÉÍÓÚÑ]/.test(nueva) || !/\d/.test(nueva) || !/[^A-Za-z0-9]/.test(nueva)) {
      setError('La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial.')
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
      // Si el ingreso con huella está activo, actualiza la credencial guardada a
      // la contraseña nueva para que la huella siga funcionando.
      await actualizarPasswordCredencial(nueva)
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
        <View>
          <Campo
            etiqueta="Nueva Contraseña"
            placeholder="Mínimo 8 caracteres"
            revelable
            autoCapitalize="none"
            value={nueva}
            onChangeText={setNueva}
          />
          {nueva.length > 0 ? <MedidorClave clave={nueva} /> : null}
        </View>
        <Campo
          etiqueta="Confirmar Nueva Contraseña"
          placeholder="Repite la contraseña"
          revelable
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
  const [metodoSel, setMetodoSel] = useState<any | null>(null)

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
        <TituloSeccion style={{ marginTop: 8 }}>Métodos de Cobro</TituloSeccion>
        <Boton texto="+ Añadir" variante="mini" onPress={() => setModal(true)} />
      </View>
      <Text style={[est.ayuda, { marginBottom: 10 }]}>Administra las cuentas donde recibirás tus comisiones.</Text>

      {cargando ? (
        <Tarjeta style={{ padding: 16 }}>
          <Text style={est.ayuda}>Cargando…</Text>
        </Tarjeta>
      ) : lista.length === 0 ? (
        <Tarjeta style={{ padding: 16 }}>
          <Text style={est.ayuda}>Aún no tienes métodos de cobro. Añade una cuenta de Pago Móvil.</Text>
        </Tarjeta>
      ) : (
        <View style={{ gap: 10 }}>
          {lista.map((p, i) => {
            const info = bancoInfo(p?.banco, p?.banco)
            return (
              <Pressable key={p?.datosPagosId ?? p?.id ?? i} onPress={() => setMetodoSel(p)}>
                <Tarjeta style={est.pagoCard}>
                  <LogoBanco codigo={p?.banco} size={42} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {p?.alias ? <Text style={est.pagoAlias}>{p.alias}</Text> : null}
                    <Text style={est.pagoBanco} numberOfLines={1}>
                      {info.nombre}
                    </Text>
                    <Text style={est.pagoLinea} numberOfLines={1}>
                      {[p?.telefono, p?.numeroDocumento].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={est.verDet}>›</Text>
                </Tarjeta>
              </Pressable>
            )
          })}
        </View>
      )}

      <ModalDetallePago metodo={metodoSel} onCerrar={() => setMetodoSel(null)} />
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

/** Detalle de un método de cobro (logo del banco + datos). */
function ModalDetallePago({ metodo, onCerrar }: { metodo: any | null; onCerrar: () => void }) {
  const info = bancoInfo(metodo?.banco, metodo?.banco)
  return (
    <Modal abierto={!!metodo} onCerrar={onCerrar} titulo="Método de cobro" subtitulo={metodo?.alias || undefined}>
      {metodo ? (
        <View>
          <View style={{ alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <LogoBanco codigo={metodo?.banco} size={68} />
            <Text style={est.detBanco}>{info.nombre}</Text>
            <Text style={est.detCod}>Código {info.codigo}</Text>
          </View>
          <Tarjeta style={{ padding: 16 }}>
            {metodo?.alias ? <Dato etiqueta="Alias" valor={metodo.alias} /> : null}
            <Dato etiqueta="Banco" valor={info.nombre} />
            <Dato etiqueta="Teléfono (Pago Móvil)" valor={metodo?.telefono} />
            <Dato etiqueta="Documento" valor={metodo?.numeroDocumento} />
          </Tarjeta>
          <View style={{ marginTop: 16 }}>
            <Boton texto="Cerrar" onPress={onCerrar} />
          </View>
        </View>
      ) : null}
    </Modal>
  )
}

/** Selector de banco con logo (insignia) al lado de cada uno. */
function SelectorBanco({
  bancos,
  valor,
  onCambiar,
}: {
  bancos: { codigo: string; nombre: string }[]
  valor: string | null
  onCambiar: (codigo: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState('')
  const sel = bancos.find((b) => b.codigo === valor)
  const q = busca.trim().toLowerCase()
  const filtrados = q ? bancos.filter((b) => b.nombre.toLowerCase().includes(q) || b.codigo.includes(q)) : bancos
  return (
    <View>
      <Text style={est.selLbl}>Banco</Text>
      <Pressable
        onPress={() => {
          setBusca('')
          setAbierto(true)
        }}
        style={est.selCampo}
      >
        {sel ? <LogoBanco codigo={sel.codigo} size={26} /> : null}
        <Text style={[est.selTxt, !sel && { color: color.text4 }]} numberOfLines={1}>
          {sel ? sel.nombre : 'Selecciona el banco'}
        </Text>
        <Text style={{ color: color.text3, fontSize: 12 }}>▾</Text>
      </Pressable>
      <Modal abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Selecciona el banco">
        <View>
          <Campo placeholder="Buscar banco…" value={busca} onChangeText={setBusca} autoCapitalize="none" style={{ marginBottom: 10 }} />
          <ScrollView style={{ maxHeight: 380 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filtrados.map((b) => (
              <Pressable
                key={b.codigo}
                onPress={() => {
                  onCambiar(b.codigo)
                  setAbierto(false)
                }}
                style={est.selItem}
              >
                <LogoBanco codigo={b.codigo} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={est.selItemNom} numberOfLines={1}>
                    {b.nombre}
                  </Text>
                  <Text style={est.selItemCod}>Código {b.codigo}</Text>
                </View>
                {b.codigo === valor ? <Text style={{ color: color.primary, fontWeight: '800' }}>✓</Text> : null}
              </Pressable>
            ))}
            {filtrados.length === 0 ? <Text style={[est.ayuda, { textAlign: 'center', padding: 20 }]}>Sin resultados</Text> : null}
          </ScrollView>
        </View>
      </Modal>
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
  const [bancos, setBancos] = useState<{ codigo: string; nombre: string }[]>([])
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
        const lista = arr.length
          ? arr.map((b) => ({ codigo: String(b.codigo).padStart(4, '0'), nombre: bancoInfo(b.codigo, b.nombre).nombre }))
          : BANCOS_VE.map((b) => ({ codigo: b.codigo, nombre: b.nombre }))
        setBancos(lista)
      })
      .catch(() => setBancos(BANCOS_VE.map((b) => ({ codigo: b.codigo, nombre: b.nombre }))))
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
        <SelectorBanco bancos={bancos} valor={banco} onCambiar={setBanco} />
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
  pagoAlias: { fontSize: 13.5, fontWeight: '800', color: color.primaryDark, marginBottom: 2 },
  pagoLinea: { fontSize: 12, color: color.text3, marginTop: 2 },
  pagoCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pagoBanco: { fontSize: 12.5, fontWeight: '600', color: color.text2 },
  verDet: { fontSize: 20, color: color.text4, fontWeight: '400' },
  detBanco: { fontSize: 15, fontWeight: '800', color: color.text, textAlign: 'center' },
  detCod: { fontSize: 11.5, color: color.text3, fontFamily: fuenteMono },
  selLbl: { fontSize: 12, fontWeight: '700', color: color.text2, marginBottom: 6 },
  selCampo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: color.white,
  },
  selTxt: { flex: 1, fontSize: 13.5, color: color.text },
  selItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.borderSoft },
  selItemNom: { fontSize: 13.5, fontWeight: '700', color: color.text },
  selItemCod: { fontSize: 11, color: color.text3, marginTop: 1, fontFamily: fuenteMono },
  linkBox: { alignSelf: 'stretch', backgroundColor: color.bgCard, borderRadius: 10, borderWidth: 1, borderColor: color.borderSoft, padding: 12 },
  linkTxt: { fontSize: 12, color: color.text2 },
})
