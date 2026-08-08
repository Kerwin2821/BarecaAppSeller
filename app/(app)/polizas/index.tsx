import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { fetchPolizas, type CategoriaPoliza } from '@/lib/polizas'
import { fechaCorta } from '@/lib/formato'
import type { DisplayPolicy, PolicyStatus } from '@/lib/tipos'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Chip, Pildora, Tarjeta } from '@/components/Ui'
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

export default function MisVentas() {
  const router = useRouter()
  const { user } = useAuth()
  const [cat, setCat] = useState<CategoriaPoliza>('vehicle')
  const [estado, setEstado] = useState<'ALL' | PolicyStatus>('ALL')

  const cargar = useCallback(() => fetchPolizas(user, cat), [user, cat])
  const { datos, cargando, error, recargar } = useApi(cargar, [user?.loginId, cat])

  const items = useMemo(() => {
    const todo = datos?.items ?? []
    if (estado === 'ALL') return todo
    return todo.filter((p) => p.status === estado)
  }, [datos, estado])

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla
        titulo="Mis Ventas"
        detalle={cargando ? 'Cargando pólizas…' : `${datos?.total ?? items.length} póliza(s) · ${CATEGORIAS.find((c) => c.valor === cat)?.texto}`}
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
          <Pressable key={s.valor} onPress={() => setEstado(s.valor)} style={[est.filtro, estado === s.valor && { backgroundColor: color.primaryLight }]}>
            <Text style={{ fontSize: 11, fontWeight: estado === s.valor ? '700' : '600', color: estado === s.valor ? color.primaryDark : color.text3 }}>
              {s.texto}
            </Text>
          </Pressable>
        ))}
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

function FilaPoliza({ p, onPress }: { p: DisplayPolicy; onPress: () => void }) {
  const cEstado = COLOR_ESTADO[p.status]
  const catTxt = p.category === 'auto' ? 'Casco' : p.category === 'funeral' ? 'Funeraria' : 'RCV'
  return (
    <Pressable onPress={onPress}>
      <Tarjeta style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={est.cliente} numberOfLines={1}>
              {p.clientName}
            </Text>
            <Text style={est.detalle} numberOfLines={1}>
              <Text style={{ fontFamily: fuenteMono, color: color.primary }}>Nº {p.policyNumber || '—'}</Text>
              {'   ·   '}
              {p.productName}
            </Text>
            {p.vehicleDetails?.plate ? <Text style={est.detalle}>Placa {p.vehicleDetails.plate}</Text> : null}
            <Text style={est.fecha}>Emitida {fechaCorta(p.saleDate)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Pildora color={cEstado} texto={p.status} />
            <Chip texto={catTxt} />
          </View>
        </View>
      </Tarjeta>
    </Pressable>
  )
}

const est = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: color.borderSoft },
  tabActivo: { backgroundColor: color.primaryLight, borderColor: color.primaryLight },
  filtros: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  filtro: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, borderColor: color.borderSoft },
  cliente: { fontSize: 14, fontWeight: '800', color: color.text },
  detalle: { fontSize: 12, color: color.text2, marginTop: 3 },
  fecha: { fontSize: 11, color: color.text4, marginTop: 4 },
})
