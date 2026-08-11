import { useCallback, useMemo, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { fetchPolizas, type CategoriaPoliza } from '@/lib/polizas'
import { mensajeDeError } from '@/lib/api'
import { fechaCorta, fechaHora, isoDia } from '@/lib/formato'
import { compartirExcel, compartirPDF, htmlReporte, type Celda } from '@/lib/exportar'
import type { DisplayPolicy, PolicyStatus } from '@/lib/tipos'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Boton, Chip, Pildora, Tarjeta } from '@/components/Ui'
import { useToast } from '@/components/Toast'
import { color, fuenteMono } from '@/lib/tema'

const COLOR_ESTADO: Record<PolicyStatus, string> = {
  Vigente: color.vigente,
  Inactiva: color.inactiva,
  Procesado: color.procesado,
  Otro: color.text3,
}

const CATEGORIAS: { valor: CategoriaPoliza; texto: string }[] = [
  { valor: 'vehicle', texto: 'RCV' },
  { valor: 'auto', texto: 'Casco' },
  { valor: 'funeral', texto: 'Funeraria' },
]

const ESTADOS: { valor: 'ALL' | PolicyStatus; texto: string }[] = [
  { valor: 'ALL', texto: 'Todas' },
  { valor: 'Vigente', texto: 'Vigentes' },
  { valor: 'Inactiva', texto: 'Inactivas' },
]

/** Logo de la aseguradora (mismo criterio que el wizard: chip blanco, sin tinte). */
const LOGOS_ASEG: { re: RegExp; src: number }[] = [
  { re: /caroni/i, src: require('../../../assets/logos/logo-caroni-blanco.png') },
  { re: /estar/i, src: require('../../../assets/logos/logo-estar-seguros.png') },
  { re: /occidental/i, src: require('../../../assets/logos/logo-laoccidental.png') },
]

function catTexto(c: string): string {
  return c === 'auto' ? 'Casco' : c === 'funeral' ? 'Funeraria' : 'RCV'
}

export default function MisVentas() {
  const router = useRouter()
  const { user } = useAuth()
  const { avisar } = useToast()
  const [cat, setCat] = useState<CategoriaPoliza>('vehicle')
  const [estado, setEstado] = useState<'ALL' | PolicyStatus>('ALL')
  const [busca, setBusca] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null)

  const cargar = useCallback(() => fetchPolizas(user, cat), [user, cat])
  const { datos, cargando, error, recargar } = useApi(cargar, [user?.loginId, cat])

  const items = useMemo(() => {
    let todo = datos?.items ?? []
    if (estado !== 'ALL') todo = todo.filter((p) => p.status === estado)
    const q = busca.trim().toLowerCase()
    if (q) {
      todo = todo.filter(
        (p) =>
          p.clientName?.toLowerCase().includes(q) ||
          p.policyNumber?.toLowerCase().includes(q) ||
          p.clientDocument?.toLowerCase().includes(q) ||
          p.vehicleDetails?.plate?.toLowerCase().includes(q) ||
          p.productName?.toLowerCase().includes(q),
      )
    }
    if (desde || hasta) {
      todo = todo.filter((p) => {
        const d = new Date(p.saleDate)
        if (Number.isNaN(d.getTime())) return true
        const dd = isoDia(d)
        if (desde && dd < desde) return false
        if (hasta && dd > hasta) return false
        return true
      })
    }
    return todo
  }, [datos, estado, busca, desde, hasta])

  const exportar = async (tipo: 'excel' | 'pdf') => {
    if (exportando) return
    if (items.length === 0) {
      avisar('No hay pólizas para exportar con estos filtros.', 'info')
      return
    }
    setExportando(tipo)
    try {
      const headers = ['Cliente', 'Documento', 'Nº Póliza', 'Aseguradora', 'Categoría', 'Placa', 'Emitida', 'Vig. Desde', 'Vig. Hasta', 'Estado', 'Vendedor']
      const filas: Celda[][] = items.map((p) => [
        p.clientName ?? '',
        p.clientDocument ?? '',
        p.policyNumber ?? '',
        p.productName ?? '',
        catTexto(p.category),
        p.vehicleDetails?.plate ?? '',
        p.saleDate ? fechaCorta(p.saleDate) : '',
        p.startDate ? fechaCorta(p.startDate) : '',
        p.endDate ? fechaCorta(p.endDate) : '',
        p.status,
        p.sellerName ?? '',
      ])
      const nombre = `mis-ventas-${catTexto(cat).toLowerCase()}-${isoDia(new Date())}`
      const meta = `Generado: ${fechaHora(new Date())}  ·  ${items.length} póliza(s) · ${catTexto(cat)}`
      if (tipo === 'excel') {
        await compartirExcel([['Mis Ventas'], [meta], headers, ...filas], nombre, 'Pólizas')
      } else {
        await compartirPDF(htmlReporte({ titulo: 'Mis Ventas', meta, headers, filas }), nombre)
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
        titulo="Mis Ventas"
        detalle={cargando ? 'Cargando pólizas…' : `${items.length} de ${datos?.total ?? items.length} · ${catTexto(cat)}`}
      />

      <View style={est.tabs}>
        {CATEGORIAS.map((c) => (
          <Pressable key={c.valor} onPress={() => setCat(c.valor)} style={[est.tab, cat === c.valor && est.tabActivo]}>
            <Text style={{ fontSize: 12.5, fontWeight: cat === c.valor ? '800' : '600', color: cat === c.valor ? color.primaryDark : color.text3 }}>
              {c.texto}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={est.filtros}>
        {ESTADOS.map((s) => (
          <Pressable key={s.valor} onPress={() => setEstado(s.valor)} style={[est.filtro, estado === s.valor && { backgroundColor: color.primaryLight, borderColor: color.primaryLight }]}>
            <Text style={{ fontSize: 11, fontWeight: estado === s.valor ? '700' : '600', color: estado === s.valor ? color.primaryDark : color.text3 }}>
              {s.texto}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Búsqueda */}
      <View style={est.buscador}>
        <Text style={{ fontSize: 14, color: color.text4 }}>⌕</Text>
        <TextInputBusca value={busca} onChange={setBusca} />
        {busca ? (
          <Pressable onPress={() => setBusca('')} hitSlop={8}>
            <Text style={{ fontSize: 14, color: color.text3 }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Rango de fechas + exportar */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <CampoFecha etiqueta="Desde" valor={desde} onCambiar={setDesde} />
        <CampoFecha etiqueta="Hasta" valor={hasta} onCambiar={setHasta} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <Boton texto="Excel" variante="mini" cargando={exportando === 'excel'} onPress={() => exportar('excel')} />
        <Boton texto="PDF / WhatsApp" variante="mini" cargando={exportando === 'pdf'} onPress={() => exportar('pdf')} />
      </View>

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : cargando ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <Tarjeta key={i} style={{ padding: 16 }}>
              <Skeleton w="55%" h={14} />
              <Skeleton w="80%" h={11} style={{ marginTop: 10 }} />
              <Skeleton w="40%" h={11} style={{ marginTop: 8 }} />
            </Tarjeta>
          ))}
        </View>
      ) : items.length === 0 ? (
        <Tarjeta>
          <EstadoVacio titulo="Sin pólizas" detalle="No hay ventas registradas para este filtro." />
        </Tarjeta>
      ) : (
        <View style={{ gap: 12 }}>
          {items.map((p) => (
            <FilaPoliza key={`${p.category}-${p.id}`} p={p} onPress={() => router.push(`/polizas/${p.id}?cat=${p.category}`)} />
          ))}
        </View>
      )}
    </Pantalla>
  )
}

function LogoAseg({ nombre }: { nombre: string }) {
  const logo = LOGOS_ASEG.find((l) => l.re.test(nombre || ''))
  if (!logo) return null
  return (
    <View style={est.logoChip}>
      <Image source={logo.src} resizeMode="contain" style={{ height: 16, width: 74 }} />
    </View>
  )
}

function FilaPoliza({ p, onPress }: { p: DisplayPolicy; onPress: () => void }) {
  const cEstado = COLOR_ESTADO[p.status]
  return (
    <Pressable onPress={onPress}>
      <Tarjeta style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={est.cliente} numberOfLines={1}>
              {p.clientName}
            </Text>
            <Text style={est.numero} numberOfLines={1}>
              Nº {p.policyNumber || '—'}
            </Text>
            <View style={est.asegRow}>
              <LogoAseg nombre={p.productName} />
              <Text style={est.aseg} numberOfLines={1}>
                {p.productName}
              </Text>
            </View>
            {p.vehicleDetails?.plate ? <Text style={est.detalle}>Placa {p.vehicleDetails.plate}</Text> : null}
            <Text style={est.fecha}>Emitida {fechaCorta(p.saleDate)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Pildora color={cEstado} texto={p.status} />
            <Chip texto={catTexto(p.category)} />
          </View>
        </View>
      </Tarjeta>
    </Pressable>
  )
}

/* ── Inputs auxiliares ── */
function TextInputBusca({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  return (
    <TextInput
      placeholder="Buscar por cliente, póliza, placa o cédula…"
      placeholderTextColor={color.text4}
      value={value}
      onChangeText={onChange}
      style={{ flex: 1, paddingVertical: 10, fontSize: 13, color: color.text }}
    />
  )
}

function CampoFecha({ etiqueta, valor, onCambiar }: { etiqueta: string; valor: string; onCambiar: (iso: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const base = valor ? new Date(`${valor}T00:00:00`) : new Date()
  return (
    <View style={{ flex: 1 }}>
      <Pressable onPress={() => setAbierto(true)} style={est.fechaBtn}>
        <Text style={{ fontSize: 12.5, color: valor ? color.text : color.text4 }}>
          {etiqueta}: {valor ? fechaCorta(valor) : '—'}
        </Text>
        {valor ? (
          <Pressable onPress={() => onCambiar('')} hitSlop={8}>
            <Text style={{ color: color.text3, fontSize: 12 }}>✕</Text>
          </Pressable>
        ) : null}
      </Pressable>
      {abierto ? (
        <DateTimePicker
          value={base}
          mode="date"
          onChange={(e, sel) => {
            setAbierto(false)
            if (e.type === 'set' && sel) onCambiar(isoDia(sel))
          }}
        />
      ) : null}
    </View>
  )
}

const est = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: color.borderSoft },
  tabActivo: { backgroundColor: color.primaryLight, borderColor: color.primaryLight },
  filtros: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  filtro: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, borderColor: color.borderSoft },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: color.white,
    marginBottom: 8,
  },
  fechaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: color.white,
  },
  cliente: { fontSize: 14, fontWeight: '800', color: color.text },
  numero: { fontSize: 12.5, fontFamily: fuenteMono, color: color.primary, marginTop: 3 },
  asegRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  logoChip: {
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: color.borderSoft,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  aseg: { flex: 1, fontSize: 12, fontWeight: '700', color: color.text2 },
  detalle: { fontSize: 12, color: color.text2, marginTop: 4 },
  fecha: { fontSize: 11, color: color.text4, marginTop: 4 },
})
