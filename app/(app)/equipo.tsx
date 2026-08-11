import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { teamApi, userApi } from '@/lib/endpoints'
import { mensajeDeError } from '@/lib/api'
import { actorUuid, etiquetaRol } from '@/lib/roles'
import { fechaCorta } from '@/lib/formato'
import type { CurrentUser, UserRole } from '@/lib/tipos'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Alerta, Boton, Campo, Chip, Tarjeta } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

type Tab = 'offices' | 'distributors' | 'kiosks' | 'employees'

/** Rol que cada nivel puede crear (creatableRoles del AuthService). */
function rolCreable(rol: UserRole | null | undefined): UserRole | null {
  if (rol === 'BARECA') return 'OFICINA_REGIONAL'
  if (rol === 'OFICINA_REGIONAL') return 'DISTRIBUIDOR'
  if (rol === 'DISTRIBUIDOR') return 'KIOSCO'
  return null
}

/** Pestañas visibles por rol (viewableTeamTabs del AuthService del portal). */
function tabsPorRol(rol: UserRole | null | undefined): { id: Tab; label: string }[] {
  const map: Record<string, { id: Tab; label: string }[]> = {
    BARECA: [
      { id: 'offices', label: 'Oficinas' },
      { id: 'distributors', label: 'Distribuidores' },
      { id: 'kiosks', label: 'Kioscos' },
    ],
    OFICINA_REGIONAL: [
      { id: 'distributors', label: 'Distribuidores' },
      { id: 'kiosks', label: 'Kioscos' },
    ],
    DISTRIBUIDOR: [{ id: 'kiosks', label: 'Kioscos' }],
  }
  return map[rol ?? ''] ?? []
}

function paramsJerarquia(user: CurrentUser | null): Record<string, string | number | undefined> {
  if (!user) return {}
  const p: Record<string, string | number | undefined> = { role: user.role }
  if (user.role === 'BARECA') p.barecaId = user.barecaEntityId
  else if (user.role === 'OFICINA_REGIONAL') p.officeId = user.officeEntityId
  else if (user.role === 'DISTRIBUIDOR') p.distributorId = user.distributorEntityId
  return p
}

export default function Equipo() {
  const { user } = useAuth()
  const tabs = useMemo(() => tabsPorRol(user?.role), [user?.role])
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'kiosks')
  const [crearAbierto, setCrearAbierto] = useState(false)
  const nuevoRol = rolCreable(user?.role)

  const cargar = useCallback(async () => {
    const r = await userApi.teamHierarchy(paramsJerarquia(user))
    // El BFF puede envolver en {data} o devolver el objeto directo.
    return (r?.data ?? r) as { offices?: any[]; distributors?: any[]; kiosks?: any[]; employees?: any[] }
  }, [user])
  // Re-carga cuando el enriquecimiento trae el id numérico del ente (antes es undefined).
  const { datos, cargando, error, recargar } = useApi(cargar, [
    user?.loginId,
    user?.barecaEntityId,
    user?.officeEntityId,
    user?.distributorEntityId,
    user?.kioskEntityId,
  ])

  const lista: any[] = useMemo(() => {
    if (!datos) return []
    if (tab === 'offices') return datos.offices ?? []
    if (tab === 'distributors') return datos.distributors ?? []
    if (tab === 'kiosks') return datos.kiosks ?? []
    return datos.employees ?? []
  }, [datos, tab])

  const cuenta = (t: Tab): number => {
    if (!datos) return 0
    if (t === 'offices') return datos.offices?.length ?? 0
    if (t === 'distributors') return datos.distributors?.length ?? 0
    if (t === 'kiosks') return datos.kiosks?.length ?? 0
    return datos.employees?.length ?? 0
  }

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla
        titulo="Gestión de Equipo"
        detalle="Tu red comercial multinivel (Corporativo → Oficina Regional → Distribuidor → Kiosco)"
      />

      {nuevoRol ? (
        <View style={{ marginBottom: 12 }}>
          <Boton texto={`+ Crear ${etiquetaRol(nuevoRol)}`} onPress={() => setCrearAbierto(true)} />
        </View>
      ) : null}

      <View style={est.tabs}>
        {tabs.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} style={[est.tab, tab === t.id && est.tabActivo]}>
            <Text style={{ fontSize: 12, fontWeight: tab === t.id ? '800' : '600', color: tab === t.id ? color.primaryDark : color.text3 }}>
              {t.label}
              {datos ? ` (${cuenta(t.id)})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : cargando ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Tarjeta key={i} style={{ padding: 16 }}>
              <Skeleton w="55%" h={14} />
              <Skeleton w="70%" h={11} style={{ marginTop: 10 }} />
            </Tarjeta>
          ))}
        </View>
      ) : lista.length === 0 ? (
        <Tarjeta>
          <EstadoVacio titulo="Sin registros" detalle="No hay entidades en este nivel todavía." />
        </Tarjeta>
      ) : (
        <View style={{ gap: 12 }}>
          {lista.map((e, i) => (
            <FilaEntidad key={e.id ?? i} e={e} tab={tab} />
          ))}
        </View>
      )}

      {nuevoRol ? (
        <ModalCrearEntidad
          abierto={crearAbierto}
          rol={nuevoRol}
          user={user}
          onCerrar={() => setCrearAbierto(false)}
          onListo={() => {
            setCrearAbierto(false)
            recargar()
          }}
        />
      ) : null}
    </Pantalla>
  )
}

/* ══════════════════════════════════════════════════════════
   Modal: crear entidad del nivel siguiente (unified-create)
   ══════════════════════════════════════════════════════════ */

function ModalCrearEntidad({
  abierto,
  rol,
  user,
  onCerrar,
  onListo,
}: {
  abierto: boolean
  rol: UserRole
  user: CurrentUser | null
  onCerrar: () => void
  onListo: () => void
}) {
  const { avisar } = useToast()
  const [nombre, setNombre] = useState('')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [correo, setCorreo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (abierto) {
      setNombre('')
      setNumeroDocumento('')
      setCorreo('')
      setTelefono('')
      setError(null)
      setEnviando(false)
    }
  }, [abierto])

  const enviar = async () => {
    if (enviando) return
    if (!nombre.trim() || !numeroDocumento.trim()) {
      setError('Completa nombre y documento.')
      return
    }
    if (!/.+@.+\..+/.test(correo)) {
      setError('Ingresa un correo válido: allí se envían las credenciales de acceso.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      // Payload de alta unificada (UserFormOutput del portal). El padre y las
      // comisiones por producto se resuelven en el backend según el creador.
      const padreUuid = user ? (actorUuid(user) ?? '') : ''
      await teamApi.unifiedCreate({
        role: rol,
        nombre: nombre.trim(),
        numeroDocumento: numeroDocumento.trim(),
        email: correo.trim(),
        telefono: telefono.trim(),
        comisionPrepagada: false,
        commissions: [],
        creadorPor: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || '',
        creadorUuid: padreUuid,
        parentId: padreUuid,
      })
      avisar(`${etiquetaRol(rol)} creado. Se enviaron credenciales a ${correo.trim()}.`, 'ok')
      onListo()
    } catch (e) {
      setError(mensajeDeError(e))
      setEnviando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={`Crear ${etiquetaRol(rol)}`} subtitulo="Se enviarán credenciales de acceso por correo">
      <Campo etiqueta="Nombre" placeholder="Nombre de la entidad" value={nombre} onChangeText={setNombre} style={{ marginBottom: 14 }} />
      <Campo
        etiqueta="Documento (RIF / Cédula)"
        placeholder="J-12345678-9"
        autoCapitalize="characters"
        value={numeroDocumento}
        onChangeText={setNumeroDocumento}
        style={{ marginBottom: 14 }}
      />
      <Campo
        etiqueta="Correo"
        placeholder="correo@ejemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        value={correo}
        onChangeText={setCorreo}
        style={{ marginBottom: 14 }}
      />
      <Campo
        etiqueta="Teléfono"
        placeholder="04120000000"
        keyboardType="phone-pad"
        value={telefono}
        onChangeText={setTelefono}
      />

      <View style={{ marginTop: 16 }}>
        <Alerta tipo="info">
          Las comisiones por producto se heredan de tu configuración. El ajuste fino de comisiones por producto
          llega en la próxima iteración.
        </Alerta>
      </View>

      {error ? (
        <View style={{ marginTop: 12 }}>
          <Alerta tipo="error">{error}</Alerta>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        <Boton texto="Cancelar" variante="soft" onPress={onCerrar} style={{ flex: 1 }} />
        <Boton texto={enviando ? 'Creando…' : 'Crear y enviar clave'} onPress={enviar} cargando={enviando} style={{ flex: 1.5 }} />
      </View>
    </Modal>
  )
}

function FilaEntidad({ e, tab }: { e: any; tab: Tab }) {
  const nombre = e.nombre || `${e.nombres ?? ''} ${e.apellidos ?? ''}`.trim() || '—'
  const activo = e.activo !== false
  const comision = e.porcentajeComision != null ? `${e.porcentajeComision}%` : null
  return (
    <Tarjeta style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={est.nombre} numberOfLines={1}>
            {nombre}
          </Text>
          <Text style={est.detalle} numberOfLines={1}>
            {e.numeroDocumento ? `${e.numeroDocumento}` : ''}
            {e.codigo ? `  ·  cód. ${e.codigo}` : ''}
          </Text>
          {e.correo || e.telefonoCelular ? (
            <Text style={est.detalle} numberOfLines={1}>
              {[e.correo, e.telefonoCelular].filter(Boolean).join('  ·  ')}
            </Text>
          ) : null}
          {e.fechaCreacion ? <Text style={est.fecha}>Creado {fechaCorta(e.fechaCreacion)}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Chip
            texto={activo ? 'Activo' : 'Inactivo'}
            fondo={activo ? color.successBg : color.borderSoft}
            colorTexto={activo ? color.success : color.text3}
          />
          {comision ? <Text style={est.comision}>{comision}</Text> : null}
          {e.comisionPrepagada != null ? (
            <Text style={est.prepago}>{e.comisionPrepagada ? 'Prepagada' : 'Estándar'}</Text>
          ) : null}
        </View>
      </View>
    </Tarjeta>
  )
}

const est = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  tab: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 99, borderWidth: 1, borderColor: color.borderSoft },
  tabActivo: { backgroundColor: color.primaryLight, borderColor: color.primaryLight },
  nombre: { fontSize: 14, fontWeight: '800', color: color.text },
  detalle: { fontSize: 11.5, color: color.text2, marginTop: 3 },
  fecha: { fontSize: 11, color: color.text4, marginTop: 4 },
  comision: { fontSize: 12, fontWeight: '700', color: color.primary, fontFamily: fuenteMono },
  prepago: { fontSize: 10, color: color.text3 },
})
