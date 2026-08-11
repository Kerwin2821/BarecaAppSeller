import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { teamApi, userApi } from '@/lib/endpoints'
import { mensajeDeError } from '@/lib/api'
import { actorUuid, etiquetaRol } from '@/lib/roles'
import { fechaHora, iniciales } from '@/lib/formato'
import { compartirCSV, compartirPDF, htmlReporte, type Celda } from '@/lib/exportar'
import type { CurrentUser, UserRole } from '@/lib/tipos'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { Alerta, Avatar, Boton, Campo, Chip, Tarjeta } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

type Tab = 'offices' | 'distributors' | 'kiosks' | 'employees'

/** Rol que cada nivel puede crear (creatableRoles del AuthService). */
function rolCreable(rol: UserRole | null | undefined): UserRole | null {
  if (rol === 'BARECA') return 'OFICINA_REGIONAL'
  if (rol === 'OFICINA_REGIONAL') return 'DISTRIBUIDOR'
  if (rol === 'DISTRIBUIDOR') return 'KIOSCO'
  return null
}

/** Etiqueta de entidad (entityType del payload unificado). */
const ENTIDAD_LABEL: Record<string, string> = {
  OFICINA_REGIONAL: 'Oficina Regional',
  DISTRIBUIDOR: 'Distribuidor',
  KIOSCO: 'Kiosco',
  BARECA: 'Bareca',
  EMPLEADO: 'Empleado',
}

/** Pestaña que corresponde al nivel recién creado. */
const TAB_DE_ROL: Record<string, Tab> = {
  OFICINA_REGIONAL: 'offices',
  DISTRIBUIDOR: 'distributors',
  KIOSCO: 'kiosks',
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

const val = (e: any, k: string): Celda => k.split('.').reduce((a: any, p) => (a ? a[p] : null), e)

/** Cabeceras + claves de export por pestaña (idénticas a downloadReport de la web). */
function configExport(tab: Tab): { headers: string[]; keys: string[]; nombre: string } {
  switch (tab) {
    case 'offices':
      return { headers: ['Nombre', 'RIF', 'Email', 'Teléfono'], keys: ['nombre', 'numeroDocumento', 'correo', 'telefonoCelular'], nombre: 'reporte_oficinas' }
    case 'distributors':
      return {
        headers: ['Nombre', 'RIF', 'Email', 'Teléfono', 'Oficina Regional'],
        keys: ['nombre', 'numeroDocumento', 'correo', 'telefonoCelular', 'oficinasRegionales.nombre'],
        nombre: 'reporte_distribuidores',
      }
    case 'kiosks':
      return {
        headers: ['Nombre', 'Documento', 'Email', 'Teléfono', 'Distribuidor'],
        keys: ['nombre', 'numeroDocumento', 'correo', 'telefonoCelular', 'distribuidores.nombre'],
        nombre: 'reporte_kioscos',
      }
    default:
      return {
        headers: ['Nombres', 'Apellidos', 'Documento', 'Email', 'Teléfono'],
        keys: ['nombres', 'apellidos', 'numeroDocumento', 'correo', 'telefono'],
        nombre: 'reporte_empleados',
      }
  }
}

export default function Equipo() {
  const { user } = useAuth()
  const { avisar } = useToast()
  const tabs = useMemo(() => tabsPorRol(user?.role), [user?.role])
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'kiosks')
  const [crearAbierto, setCrearAbierto] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [busca, setBusca] = useState('')
  const [exportando, setExportando] = useState<'csv' | 'pdf' | null>(null)
  // Entidades recién creadas en esta sesión, para mostrarlas de inmediato aunque el
  // backend tarde en reflejarlas (o no las vincule) en la jerarquía.
  const [extras, setExtras] = useState<{ tab: Tab; e: any }[]>([])
  const nuevoRol = rolCreable(user?.role)
  // El nivel que el usuario crea es también el que puede editar (sus hijos directos).
  const tabEditable: Tab | null = nuevoRol ? TAB_DE_ROL[nuevoRol] : null

  const cargar = useCallback(async () => {
    const r = await userApi.teamHierarchy(paramsJerarquia(user))
    return (r?.data ?? r) as { offices?: any[]; distributors?: any[]; kiosks?: any[]; employees?: any[] }
  }, [user])
  const { datos, cargando, error, recargar } = useApi(cargar, [
    user?.loginId,
    user?.barecaEntityId,
    user?.officeEntityId,
    user?.distributorEntityId,
    user?.kioskEntityId,
  ])

  const baseFor = useCallback(
    (t: Tab): any[] => {
      if (!datos) return []
      if (t === 'offices') return datos.offices ?? []
      if (t === 'distributors') return datos.distributors ?? []
      if (t === 'kiosks') return datos.kiosks ?? []
      return datos.employees ?? []
    },
    [datos],
  )
  // Mezcla la lista del backend con las entidades locales recién creadas (dedupe por documento).
  const mergedFor = useCallback(
    (t: Tab): any[] => {
      const base = baseFor(t)
      const docs = new Set(base.map((x: any) => String(x?.numeroDocumento ?? '').toLowerCase()).filter(Boolean))
      const locales = extras
        .filter((x) => x.tab === t && !docs.has(String(x.e?.numeroDocumento ?? '').toLowerCase()))
        .map((x) => x.e)
      return [...locales, ...base]
    },
    [baseFor, extras],
  )
  const lista: any[] = useMemo(() => mergedFor(tab), [mergedFor, tab])

  // Persistencia de las entidades recién creadas: se guardan por usuario para que
  // NO desaparezcan al salir y volver a entrar (el backend puede tardar en reflejarlas).
  const keyExtras = user?.loginId ? `equipo.extras.${user.loginId}` : null
  const hidratado = useRef(false)
  useEffect(() => {
    if (!keyExtras) return
    AsyncStorage.getItem(keyExtras)
      .then((s) => {
        if (s) {
          try {
            const arr = JSON.parse(s)
            if (Array.isArray(arr)) setExtras(arr)
          } catch {
            /* ignore */
          }
        }
        hidratado.current = true
      })
      .catch(() => {
        hidratado.current = true
      })
  }, [keyExtras])
  useEffect(() => {
    if (!keyExtras || !hidratado.current) return
    AsyncStorage.setItem(keyExtras, JSON.stringify(extras)).catch(() => undefined)
  }, [extras, keyExtras])
  // Poda los locales que el backend ya devuelve (por documento), para no dejar "Sincronizando…" eterno.
  useEffect(() => {
    setExtras((prev) => {
      const podado = prev.filter((x) => {
        const docs = new Set(baseFor(x.tab).map((b: any) => String(b?.numeroDocumento ?? '').toLowerCase()).filter(Boolean))
        return !docs.has(String(x.e?.numeroDocumento ?? '').toLowerCase())
      })
      return podado.length === prev.length ? prev : podado
    })
  }, [datos, baseFor])

  // Búsqueda por Nombre o Documento (client-side, como la web).
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return lista
    return lista.filter((e) => {
      const nombre = (e.nombre || `${e.nombres ?? ''} ${e.apellidos ?? ''}`).toLowerCase()
      const doc = String(e.numeroDocumento ?? '').toLowerCase()
      return nombre.includes(q) || doc.includes(q)
    })
  }, [lista, busca])

  const cuenta = (t: Tab): number => mergedFor(t).length
  const tabLabel = tabs.find((t) => t.id === tab)?.label ?? ''

  const exportar = async (tipo: 'csv' | 'pdf') => {
    if (exportando) return
    if (filtrados.length === 0) {
      avisar('No hay datos para exportar con la búsqueda actual.', 'info')
      return
    }
    setExportando(tipo)
    try {
      const cfg = configExport(tab)
      const filas: Celda[][] = filtrados.map((e) => cfg.keys.map((k) => val(e, k) ?? ''))
      if (tipo === 'csv') {
        await compartirCSV([cfg.headers, ...filas], cfg.nombre)
      } else {
        await compartirPDF(
          htmlReporte({
            titulo: `Gestión de Equipo · ${tabLabel}`,
            meta: `Generado: ${fechaHora(new Date())}  ·  ${filtrados.length} registros`,
            headers: cfg.headers,
            filas,
          }),
          cfg.nombre,
        )
      }
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    } finally {
      setExportando(null)
    }
  }

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla
        titulo="Gestión de Equipo"
        detalle="Tu red comercial multinivel (Corporativo → Oficina Regional → Distribuidor → Kiosco)"
      />

      {nuevoRol ? (
        <View style={{ marginBottom: 12 }}>
          <Boton texto={`+ Añadir ${etiquetaRol(nuevoRol)} a mi Equipo`} onPress={() => setCrearAbierto(true)} />
        </View>
      ) : null}

      <View style={est.tabs}>
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => {
              setTab(t.id)
              setBusca('')
            }}
            style={[est.tab, tab === t.id && est.tabActivo]}
          >
            <Text style={{ fontSize: 12, fontWeight: tab === t.id ? '800' : '600', color: tab === t.id ? color.primaryDark : color.text3 }}>
              {t.label}
              {datos ? ` (${cuenta(t.id)})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Export CSV / PDF */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <Boton texto="CSV" variante="mini" cargando={exportando === 'csv'} onPress={() => exportar('csv')} />
        <Boton texto="PDF" variante="mini" cargando={exportando === 'pdf'} onPress={() => exportar('pdf')} />
      </View>

      {/* Título + contador + buscador */}
      <Text style={est.listaTitulo}>
        {tabLabel} {datos ? `(${cuenta(tab)})` : ''}
      </Text>
      <View style={est.buscador}>
        <Text style={{ fontSize: 14, color: color.text4 }}>⌕</Text>
        <TextInput
          placeholder="Buscar por Nombre o Documento…"
          placeholderTextColor={color.text4}
          value={busca}
          onChangeText={setBusca}
          style={est.buscadorInput}
        />
        {busca ? (
          <Pressable onPress={() => setBusca('')} hitSlop={8}>
            <Text style={{ fontSize: 14, color: color.text3 }}>✕</Text>
          </Pressable>
        ) : null}
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
      ) : filtrados.length === 0 ? (
        <Tarjeta>
          <EstadoVacio titulo="Sin registros" detalle={busca ? 'No hay coincidencias con tu búsqueda.' : 'No hay entidades en este nivel todavía.'} />
        </Tarjeta>
      ) : (
        <View style={{ gap: 12 }}>
          {filtrados.map((e, i) => (
            <FilaEntidad
              key={e.id ?? i}
              e={e}
              tab={tab}
              editable={tab === tabEditable && !e._local && e.id != null}
              onEditar={() => setEditando(e)}
            />
          ))}
        </View>
      )}

      {nuevoRol ? (
        <ModalCrearEntidad
          abierto={crearAbierto}
          rol={nuevoRol}
          user={user}
          onCerrar={() => setCrearAbierto(false)}
          onListo={(nuevo) => {
            setCrearAbierto(false)
            setBusca('')
            const t = nuevoRol ? TAB_DE_ROL[nuevoRol] : undefined
            if (t) setTab(t)
            // Muestra el recién creado de inmediato (el backend puede tardar en reflejarlo).
            if (nuevo && t) setExtras((prev) => [{ tab: t, e: nuevo }, ...prev])
            recargar()
            // El alta hace varios pasos en el backend; reintenta por si la lista aún no lo refleja.
            setTimeout(() => recargar(), 1500)
            setTimeout(() => recargar(), 4000)
          }}
        />
      ) : null}

      <ModalEditarEntidad
        entidad={editando}
        tab={tab}
        user={user}
        onCerrar={() => setEditando(null)}
        onListo={() => {
          setEditando(null)
          recargar()
        }}
      />
    </Pantalla>
  )
}

/* ══════════════════════════════════════════════════════════
   Modal: crear entidad del nivel siguiente + comisiones por producto
   ══════════════════════════════════════════════════════════ */
type ItemCom = { productId: string; productName: string; min: number; max: number; on: boolean; pct: string }

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
  onListo: (nuevo?: any) => void
}) {
  const { avisar } = useToast()
  const [nombre, setNombre] = useState('')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [correo, setCorreo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [items, setItems] = useState<ItemCom[]>([])
  const [cargandoCom, setCargandoCom] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || !user) return
    setNombre('')
    setNumeroDocumento('')
    setCorreo('')
    setTelefono('')
    setError(null)
    setEnviando(false)
    setCargandoCom(true)
    const uuid = actorUuid(user) ?? ''
    Promise.all([
      userApi
        .productos()
        .then((r: any) => (r?.data ?? r ?? []) as any[])
        .catch(() => []),
      uuid
        ? teamApi
            .comisionesMinima(user.role, uuid)
            .then((r: any) => (r?.data ?? r ?? []) as any[])
            .catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([prods, minima]) => {
        const caps = new Map<string, { min: number; max: number }>()
        for (const c of minima) {
          const pid = c?.productos?.productoId ?? c?.productoId
          if (pid) caps.set(String(pid).toUpperCase(), { min: c?.comisionMinima ?? 0, max: c?.porcentajeComision ?? 0 })
        }
        let base: ItemCom[]
        if (user.role === 'BARECA') {
          base = prods
            .filter((p) => p.productoId)
            .map((p) => ({ productId: p.productoId, productName: p.nombre ?? p.productoId, min: 0, max: 100, on: true, pct: '' }))
        } else {
          base = prods
            .filter((p) => p.productoId && caps.has(String(p.productoId).toUpperCase()))
            .map((p) => {
              const cap = caps.get(String(p.productoId).toUpperCase())!
              return { productId: p.productoId, productName: p.nombre ?? p.productoId, min: cap.min, max: cap.max, on: true, pct: String(cap.max) }
            })
        }
        setItems(base)
      })
      .finally(() => setCargandoCom(false))
  }, [abierto, user])

  const setItem = (id: string, patch: Partial<ItemCom>) =>
    setItems((arr) => arr.map((it) => (it.productId === id ? { ...it, ...patch } : it)))

  const enviar = async () => {
    if (enviando || !user) return
    if (!nombre.trim() || !numeroDocumento.trim()) {
      setError('Completa nombre y documento.')
      return
    }
    if (!/.+@.+\..+/.test(correo)) {
      setError('Ingresa un correo válido: allí se envían las credenciales de acceso.')
      return
    }
    const activos = items.filter((i) => i.on)
    for (const it of activos) {
      const v = Number(it.pct)
      if (it.pct.trim() === '' || Number.isNaN(v)) {
        setError(`Indica la comisión de "${it.productName}".`)
        return
      }
      if (v > it.max) {
        setError(`La comisión de "${it.productName}" no puede superar tu ${it.max}% asignado.`)
        return
      }
      if (v < it.min) {
        setError(`La comisión de "${it.productName}" no puede ser menor a ${it.min}%.`)
        return
      }
    }
    setEnviando(true)
    setError(null)
    try {
      // Administrador (empleado que inicia sesión) derivado de la entidad, igual
      // que el "copiar datos" de la web: el BFF exige adminNombres/adminApellidos.
      const partes = nombre.trim().split(/\s+/).filter(Boolean)
      const adminNombres = partes[0] || nombre.trim()
      const adminApellidos = partes.length > 1 ? partes.slice(1).join(' ') : (partes[0] || nombre.trim())
      const formData = {
        nombre: nombre.trim(),
        numeroDocumento: numeroDocumento.trim(),
        email: correo.trim(),
        telefono: telefono.trim(),
        role: rol,
        comisionPrepagada: false,
        adminNombres,
        adminApellidos,
        adminNumeroDocumento: numeroDocumento.trim(),
        adminEmail: correo.trim(),
        adminTelefono: telefono.trim(),
        commissions: activos.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          percentage: Number(it.pct),
          configuredPercentage: it.max,
          isActive: true,
        })),
      }
      const payload = {
        entityType: ENTIDAD_LABEL[rol],
        creatorName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || '',
        userRole: user.role,
        context: { officeId: null, distributorId: null, kioskId: null },
        formData,
        currentUserCtx: {
          barecaId: user.barecaId,
          oficinaRegionalId: user.oficinaRegionalId,
          distribuidorId: user.distribuidorId,
          kioscopuestoId: user.kioskoId,
        },
      }
      await teamApi.unifiedCreate(payload)
      avisar(`${etiquetaRol(rol)} creado. Se enviaron credenciales a ${correo.trim()}.`, 'ok')
      onListo({
        nombre: nombre.trim(),
        numeroDocumento: numeroDocumento.trim(),
        correo: correo.trim(),
        telefonoCelular: telefono.trim(),
        activo: true,
        _local: true,
      })
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
      <Campo etiqueta="Teléfono" placeholder="04120000000" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} />

      {/* Comisiones por producto */}
      <Text style={est.comTitulo}>Comisiones por producto</Text>
      <Text style={est.comAyuda}>
        Define el porcentaje que recibirá {etiquetaRol(rol).toLowerCase()} por cada producto. No puede superar tu comisión asignada.
      </Text>
      {cargandoCom ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} w="100%" h={44} />
          ))}
        </View>
      ) : items.length === 0 ? (
        <Alerta tipo="info">No tienes productos con comisión asignada para repartir. La entidad se creará sin comisiones y podrás configurarlas luego.</Alerta>
      ) : (
        <ScrollView style={{ maxHeight: 230, marginTop: 6 }} nestedScrollEnabled>
          {items.map((it) => (
            <View key={it.productId} style={est.comFila}>
              <Switch
                value={it.on}
                onValueChange={(v) => setItem(it.productId, { on: v })}
                trackColor={{ true: color.primary, false: '#CBD5E1' }}
                thumbColor="#fff"
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={est.comNombre} numberOfLines={1}>
                  {it.productName}
                </Text>
                <Text style={est.comTope}>
                  Máx {it.max}%{it.min > 0 ? ` · Mín ${it.min}%` : ''}
                </Text>
              </View>
              <View style={est.comPct}>
                <TextInput
                  value={it.pct}
                  onChangeText={(t) => setItem(it.productId, { pct: t.replace(/[^0-9.]/g, '') })}
                  editable={it.on}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={color.text4}
                  style={[est.comInput, !it.on && { opacity: 0.4 }]}
                />
                <Text style={est.comPctSign}>%</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {error ? (
        <View style={{ marginTop: 12 }}>
          <Alerta tipo="error">{error}</Alerta>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Boton texto="Cancelar" variante="soft" onPress={onCerrar} style={{ flex: 1 }} />
        <Boton texto={enviando ? 'Creando…' : 'Crear y enviar clave'} onPress={enviar} cargando={enviando} style={{ flex: 1.5 }} />
      </View>
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════════
   Modal: editar entidad (datos del administrador + comisiones), como la web
   ══════════════════════════════════════════════════════════ */
const CFG_EDIT: Record<Tab, { uuidField: string; nodoParam: string; nodoField: string; empParam: string; tipoActor: string }> = {
  offices: { uuidField: 'oficinaRegionalId', nodoParam: 'nodoOficinaId.equals', nodoField: 'nodoOficinaId', empParam: 'oficinasRegionalesId.equals', tipoActor: 'OFICINA_REGIONAL' },
  distributors: { uuidField: 'distribuidorId', nodoParam: 'nodoDistribuidorId.equals', nodoField: 'nodoDistribuidorId', empParam: 'distribuidoresId.equals', tipoActor: 'DISTRIBUIDOR' },
  kiosks: { uuidField: 'kioscosPuestosId', nodoParam: 'nodoKioscoId.equals', nodoField: 'nodoKioscoId', empParam: 'kioscosPuestosId.equals', tipoActor: 'KIOSCO' },
  employees: { uuidField: '', nodoParam: '', nodoField: '', empParam: '', tipoActor: '' },
}
const aArr = (r: any): any[] => (Array.isArray(r) ? r : (r?.data ?? []))
/** Teléfono a formato internacional (igual que FormatService.toInternationalFormat de la web). */
function aInternacional(phone: string): string {
  if (!phone) return ''
  let limpio = phone.replace(/\D/g, '')
  if (limpio.startsWith('58')) return `+${limpio}`
  if (limpio.startsWith('0')) limpio = limpio.substring(1)
  return `58${limpio}`
}

type ItemEdit = { productId: string; productName: string; min: number; max: number; on: boolean; pct: string }

function ModalEditarEntidad({
  entidad,
  tab,
  user,
  onCerrar,
  onListo,
}: {
  entidad: any | null
  tab: Tab
  user: CurrentUser | null
  onCerrar: () => void
  onListo: () => void
}) {
  const { avisar } = useToast()
  const abierto = !!entidad
  const cfg = CFG_EDIT[tab]
  const numId = entidad?.id
  const uuid = entidad?.[cfg.uuidField]

  const [nombres, setNombres] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [documento, setDocumento] = useState('')
  const [correo, setCorreo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [adminEmpleadoId, setAdminEmpleadoId] = useState<string | null>(null)
  const [existentes, setExistentes] = useState<any[]>([])
  const [items, setItems] = useState<ItemEdit[]>([])
  const [cargando, setCargando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || !user || numId == null) return
    setCargando(true)
    setError(null)
    const actorUuidCreador = actorUuid(user) ?? ''
    Promise.all([
      teamApi.comisionesNodos({ [cfg.nodoParam]: numId, 'activo.equals': 'true', page: 0, size: 1000 }).then(aArr).catch(() => []),
      teamApi.empleadosDe({ [cfg.empParam]: numId, page: 0, size: 1000 }).then(aArr).catch(() => []),
      userApi.productos().then(aArr).catch(() => []),
      actorUuidCreador ? teamApi.comisionesMinima(user.role, actorUuidCreador).then(aArr).catch(() => []) : Promise.resolve([] as any[]),
    ])
      .then(async ([comis, emps, prods, minima]) => {
        setExistentes(comis)
        const admin = emps[0]
        if (admin) {
          setNombres(admin.nombres ?? '')
          setApellidos(admin.apellidos ?? '')
          setDocumento(admin.numeroDocumento ?? '')
          setAdminEmpleadoId(admin.empleadoId ?? null)
          if (admin.id != null) {
            const [ce, te] = await Promise.all([
              teamApi.correosEmpleados({ 'empleadosId.equals': admin.id, page: 0, size: 5 }).then(aArr).catch(() => []),
              teamApi.telefonosEmpleados({ 'empleadosId.equals': admin.id, page: 0, size: 5 }).then(aArr).catch(() => []),
            ])
            setCorreo(ce[0]?.correo ?? '')
            setTelefono(te[0]?.telefonoNacional ?? '')
          }
        }
        const caps = new Map<string, { min: number; max: number }>()
        for (const c of minima) {
          const pid = c?.productos?.productoId ?? c?.productoId
          if (pid) caps.set(String(pid).toUpperCase(), { min: c?.comisionMinima ?? 0, max: c?.porcentajeComision ?? 0 })
        }
        const base: ItemEdit[] = prods
          .filter((p: any) => p.productoId && (user.role === 'BARECA' || caps.has(String(p.productoId).toUpperCase())))
          .map((p: any) => {
            const cap = caps.get(String(p.productoId).toUpperCase()) ?? { min: 0, max: 100 }
            const ex = comis.find((c: any) => (c?.productos?.productoId ?? c?.productoId) === p.productoId)
            return {
              productId: p.productoId,
              productName: p.nombre ?? p.productoId,
              min: cap.min,
              max: cap.max,
              on: !!ex,
              pct: ex ? String(ex.porcentajeComision ?? cap.max) : String(cap.max),
            }
          })
        setItems(base)
      })
      .finally(() => setCargando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, numId])

  const setItem = (id: string, patch: Partial<ItemEdit>) =>
    setItems((arr) => arr.map((it) => (it.productId === id ? { ...it, ...patch } : it)))

  const construirComision = (pct: number, it: ItemEdit, obs: string): any => {
    const payload: any = {
      tipoActor: cfg.tipoActor,
      porcentajeComision: pct,
      porcentajeConfigurado: cfg.tipoActor === 'OFICINA_REGIONAL' ? it.max : 0,
      observaciones: obs,
      productoId: it.productId,
      nodoBarecaId: null,
      nodoOficinaId: null,
      nodoDistribuidorId: null,
      nodoKioscoId: null,
      padreBarecaId: null,
      padreOficinaId: null,
      padreDistribuidorId: null,
    }
    payload[cfg.nodoField] = uuid
    if (user?.role === 'BARECA') payload.padreBarecaId = user.barecaId
    else if (user?.role === 'OFICINA_REGIONAL') payload.padreOficinaId = user.oficinaRegionalId
    else if (user?.role === 'DISTRIBUIDOR') payload.padreDistribuidorId = user.distribuidorId
    return payload
  }

  const guardar = async () => {
    if (enviando || !user) return
    if (!nombres.trim() || !apellidos.trim()) {
      setError('Completa nombres y apellidos del administrador.')
      return
    }
    if (!/.+@.+\..+/.test(correo)) {
      setError('Ingresa un correo válido.')
      return
    }
    const activos = items.filter((i) => i.on)
    for (const it of activos) {
      const v = Number(it.pct)
      if (it.pct.trim() === '' || Number.isNaN(v)) {
        setError(`Indica la comisión de "${it.productName}".`)
        return
      }
      if (v > it.max) {
        setError(`La comisión de "${it.productName}" no puede superar ${it.max}%.`)
        return
      }
      if (v < it.min) {
        setError(`La comisión de "${it.productName}" no puede ser menor a ${it.min}%.`)
        return
      }
    }
    setEnviando(true)
    setError(null)
    try {
      if (adminEmpleadoId) {
        await teamApi
          .updateEmpleado(adminEmpleadoId, {
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            numeroDocumento: documento.trim(),
            correo: correo.trim(),
            telefono: aInternacional(telefono.trim()),
          })
          .catch(() => undefined)
      }
      const tareas: Promise<any>[] = []
      const pidExistentes = existentes.map((d) => d?.productos?.productoId ?? d?.productoId)
      for (const ex of existentes) {
        const pid = ex?.productos?.productoId ?? ex?.productoId
        const upd = activos.find((a) => a.productId === pid)
        if (upd) {
          if (Number(ex.porcentajeComision) !== Number(upd.pct)) {
            tareas.push(teamApi.assignCommission(construirComision(Number(upd.pct), upd, `Actualización: ${upd.productName}`)))
          }
        } else if (ex.activo) {
          tareas.push(teamApi.updateCommission(ex.id, { ...ex, activo: false }))
        }
      }
      for (const a of activos) {
        if (!pidExistentes.includes(a.productId)) {
          tareas.push(teamApi.assignCommission(construirComision(Number(a.pct), a, `Creación: ${a.productName}`)))
          tareas.push(
            teamApi.assignActorProduct({
              tipoActor: cfg.tipoActor,
              actorId: uuid,
              productoId: a.productId,
              fechaCreacion: new Date().toISOString(),
              fechaFinalizacion: null,
              activo: true,
            }),
          )
        }
      }
      await Promise.allSettled(tareas)
      avisar('Cambios guardados.', 'ok')
      onListo()
    } catch (e) {
      setError(mensajeDeError(e))
      setEnviando(false)
    }
  }

  const nombreEntidad = entidad?.nombre || `${nombres} ${apellidos}`.trim()

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={`Editar ${etiquetaRol(cfg.tipoActor as UserRole)}`} subtitulo={nombreEntidad || undefined}>
      {cargando ? (
        <View style={{ gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} w="100%" h={44} />
          ))}
        </View>
      ) : (
        <View>
          <Text style={est.comTitulo}>Datos del administrador</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Campo etiqueta="Nombres" value={nombres} onChangeText={setNombres} style={{ flex: 1 }} />
            <Campo etiqueta="Apellidos" value={apellidos} onChangeText={setApellidos} style={{ flex: 1 }} />
          </View>
          <Campo etiqueta="Documento" autoCapitalize="characters" value={documento} onChangeText={setDocumento} style={{ marginTop: 12 }} />
          <Campo etiqueta="Correo" keyboardType="email-address" autoCapitalize="none" value={correo} onChangeText={setCorreo} style={{ marginTop: 12 }} />
          <Campo etiqueta="Teléfono" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} style={{ marginTop: 12 }} />

          <Text style={est.comTitulo}>Comisiones por producto</Text>
          <Text style={est.comAyuda}>Activa un producto y ajusta su porcentaje (no puede superar tu comisión asignada).</Text>
          {items.length === 0 ? (
            <Alerta tipo="info">No hay productos con comisión asignable.</Alerta>
          ) : (
            <ScrollView style={{ maxHeight: 220, marginTop: 6 }} nestedScrollEnabled>
              {items.map((it) => (
                <View key={it.productId} style={est.comFila}>
                  <Switch
                    value={it.on}
                    onValueChange={(v) => setItem(it.productId, { on: v })}
                    trackColor={{ true: color.primary, false: '#CBD5E1' }}
                    thumbColor="#fff"
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={est.comNombre} numberOfLines={1}>
                      {it.productName}
                    </Text>
                    <Text style={est.comTope}>
                      Máx {it.max}%{it.min > 0 ? ` · Mín ${it.min}%` : ''}
                    </Text>
                  </View>
                  <View style={est.comPct}>
                    <TextInput
                      value={it.pct}
                      onChangeText={(t) => setItem(it.productId, { pct: t.replace(/[^0-9.]/g, '') })}
                      editable={it.on}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={color.text4}
                      style={[est.comInput, !it.on && { opacity: 0.4 }]}
                    />
                    <Text style={est.comPctSign}>%</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {error ? (
            <View style={{ marginTop: 12 }}>
              <Alerta tipo="error">{error}</Alerta>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Boton texto="Cancelar" variante="soft" onPress={onCerrar} style={{ flex: 1 }} />
            <Boton texto={enviando ? 'Guardando…' : 'Guardar cambios'} onPress={guardar} cargando={enviando} style={{ flex: 1.5 }} />
          </View>
        </View>
      )}
    </Modal>
  )
}

function FilaMeta({ icon, v }: { icon: string; v: string }) {
  return (
    <View style={est.metaRow}>
      <Text style={est.metaIcon}>{icon}</Text>
      <Text style={est.metaTxt} numberOfLines={1}>
        {v}
      </Text>
    </View>
  )
}

function FilaEntidad({ e, tab, editable, onEditar }: { e: any; tab: Tab; editable: boolean; onEditar: () => void }) {
  const nombre = e.nombre || `${e.nombres ?? ''} ${e.apellidos ?? ''}`.trim() || '—'
  const activo = e.activo !== false
  const correo = e.correo ?? e.email ?? null
  const telefono = e.telefonoCelular ?? e.telefono ?? null
  const padre = tab === 'kiosks' ? e.distribuidores?.nombre : tab === 'distributors' ? e.oficinasRegionales?.nombre : null
  const tieneMeta = correo || telefono || padre || e.codigo
  return (
    <Tarjeta style={{ padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar texto={iniciales(nombre)} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={est.nombre} numberOfLines={1}>
            {nombre}
          </Text>
          {e.numeroDocumento ? <Text style={est.detalle}>{e.numeroDocumento}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <Chip
            texto={activo ? 'Activo' : 'Inactivo'}
            fondo={activo ? color.successBg : color.borderSoft}
            colorTexto={activo ? color.success : color.text3}
          />
          {e._local ? <Text style={est.sincro}>Sincronizando…</Text> : null}
        </View>
      </View>

      {tieneMeta ? (
        <View style={est.metaBox}>
          {correo ? <FilaMeta icon="✉️" v={correo} /> : null}
          {telefono ? <FilaMeta icon="📞" v={telefono} /> : null}
          {padre ? <FilaMeta icon="🏢" v={`Depende de: ${padre}`} /> : null}
          {e.codigo ? <FilaMeta icon="🔖" v={`Código ${e.codigo}`} /> : null}
        </View>
      ) : null}

      {editable ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
          <Boton texto="Editar" variante="soft" onPress={onEditar} />
        </View>
      ) : null}
    </Tarjeta>
  )
}

const est = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  tab: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 99, borderWidth: 1, borderColor: color.borderSoft },
  tabActivo: { backgroundColor: color.primaryLight, borderColor: color.primaryLight },
  listaTitulo: { fontSize: 15, fontWeight: '800', color: color.text, marginBottom: 8 },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: color.white,
    marginBottom: 14,
  },
  buscadorInput: { flex: 1, paddingVertical: 10, fontSize: 13.5, color: color.text },
  nombre: { fontSize: 14, fontWeight: '800', color: color.text },
  detalle: { fontSize: 11.5, color: color.text2, marginTop: 3 },
  metaBox: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: color.borderSoft, gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaIcon: { fontSize: 12, width: 18 },
  metaTxt: { flex: 1, fontSize: 12, color: color.text2 },
  fecha: { fontSize: 11, color: color.text4, marginTop: 4 },
  codigo: { fontSize: 11, color: color.text3, fontFamily: fuenteMono },
  sincro: { fontSize: 10, color: color.warning, fontWeight: '700' },
  comTitulo: { fontSize: 13.5, fontWeight: '800', color: color.text, marginTop: 18 },
  comAyuda: { fontSize: 11.5, color: color.text3, marginTop: 4, lineHeight: 16 },
  comFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
  },
  comNombre: { fontSize: 13, fontWeight: '700', color: color.text },
  comTope: { fontSize: 10.5, color: color.text3, marginTop: 2 },
  comPct: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  comInput: {
    width: 52,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: 13.5,
    color: color.text,
    textAlign: 'right',
    backgroundColor: color.white,
  },
  comPctSign: { fontSize: 13, fontWeight: '700', color: color.text3 },
})
