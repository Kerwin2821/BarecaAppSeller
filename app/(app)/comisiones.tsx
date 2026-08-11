import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { comisionApi } from '@/lib/endpoints'
import { desenvolver } from '@/lib/api'
import { actorUuid } from '@/lib/roles'
import { moneda } from '@/lib/formato'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { CargandoBloque, EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Pildora, Tarjeta } from '@/components/Ui'
import { color } from '@/lib/tema'

type Estado = 'PENDIENTE' | 'PAGADA' | 'ANULADA'
const ESTADOS: { v: Estado; t: string }[] = [
  { v: 'PENDIENTE', t: 'Pendientes' },
  { v: 'PAGADA', t: 'Pagadas' },
  { v: 'ANULADA', t: 'Anuladas' },
]

function TarjetaTotal({ etiqueta, valor, color: c }: { etiqueta: string; valor: number | undefined; color: string }) {
  return (
    <Tarjeta style={[est.total, { borderLeftColor: c, borderLeftWidth: 3 }]}>
      <Text style={est.totalEtiqueta}>{etiqueta}</Text>
      <Text style={[est.totalValor, { color: c }]}>{moneda(valor ?? 0)}</Text>
    </Tarjeta>
  )
}

/** Fecha ISO → dd/mm/aaaa hh:mm. */
function fechaHora(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function colorEstado(e?: string): string {
  const s = (e || '').toUpperCase()
  if (s === 'PAGADA') return color.success
  if (s === 'ANULADA') return color.danger
  return color.warning
}

export default function Comisiones() {
  const { user } = useAuth()
  const [estado, setEstado] = useState<Estado>('PENDIENTE')

  // Totales del actor (CommissionTotals).
  const cargarTotales = useCallback(async () => {
    if (!user) return null
    const uuid = actorUuid(user) ?? ''
    if (!uuid) return null
    const r = await comisionApi.totales(user.role, uuid)
    return desenvolver(r) as any
  }, [user])
  const { datos, cargando, error, recargar } = useApi<any>(cargarTotales, [user?.loginId])

  // Lista de comisiones generadas (transacciones/subárbol), como la web.
  const cargarLista = useCallback(async () => {
    if (!user) return [] as any[]
    const uuid = actorUuid(user) ?? ''
    if (!uuid) return [] as any[]
    const hasta = new Date()
    const desde = new Date(hasta.getFullYear(), hasta.getMonth() - 1, hasta.getDate())
    const r = await comisionApi.subarbol({
      tipoRaiz: user.role,
      uuidRaiz: uuid,
      tipoObjetivo: user.role, // "Mis Comisiones" (SELF)
      estado,
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      page: 0,
      size: 50,
      sort: 'fechaCreacion,desc,id,desc',
    })
    const d = (r as any)?.content ?? (r as any)?.data ?? (Array.isArray(r) ? r : [])
    return Array.isArray(d) ? d : []
  }, [user, estado])
  const { datos: lista, cargando: cargandoLista, recargar: recargarLista } = useApi<any[]>(cargarLista, [user?.loginId, estado])

  const generado = datos?.totalHistorico ?? datos?.totalGenerado ?? datos?.total ?? datos?.montoTotal
  const pagado = datos?.totalPagada ?? datos?.totalPagado ?? datos?.pagado ?? datos?.montoPagado
  const pendiente = datos?.totalPendiente ?? datos?.pendiente ?? datos?.montoPendiente

  const refrescar = () => {
    recargar()
    recargarLista()
  }

  return (
    <Pantalla onRefresh={refrescar}>
      <CabeceraPantalla titulo="Mis Comisiones" detalle="Balance y comisiones generadas" />

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : cargando ? (
        <CargandoBloque texto="Calculando comisiones…" />
      ) : (
        <View style={{ gap: 12 }}>
          <TarjetaTotal etiqueta="TOTAL GENERADO" valor={generado} color={color.primary} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <TarjetaTotal etiqueta="PAGADO" valor={pagado} color={color.success} />
            </View>
            <View style={{ flex: 1 }}>
              <TarjetaTotal etiqueta="PENDIENTE" valor={pendiente} color={color.warning} />
            </View>
          </View>

          {/* Comisiones Generadas */}
          <Text style={est.seccion}>Comisiones Generadas</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {ESTADOS.map((e) => {
              const sel = estado === e.v
              return (
                <Pressable key={e.v} onPress={() => setEstado(e.v)} style={[est.chip, sel && est.chipOn]}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: sel ? '#fff' : color.text2 }}>{e.t}</Text>
                </Pressable>
              )
            })}
          </View>

          {cargandoLista ? (
            <View style={{ gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <Tarjeta key={i} style={{ padding: 14 }}>
                  <Skeleton w="45%" h={12} />
                  <Skeleton w="70%" h={11} style={{ marginTop: 8 }} />
                </Tarjeta>
              ))}
            </View>
          ) : (lista ?? []).length === 0 ? (
            <Tarjeta>
              <EstadoVacio titulo="Sin comisiones" detalle={`No hay comisiones ${estado === 'PENDIENTE' ? 'pendientes' : estado === 'PAGADA' ? 'pagadas' : 'anuladas'} en el período.`} />
            </Tarjeta>
          ) : (
            <View style={{ gap: 8 }}>
              {(lista ?? []).map((t, i) => (
                <Tarjeta key={t?.itemId ?? i} style={est.fila}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={est.filaPoliza}>Póliza #{t?.numeroPoliza ?? '—'}</Text>
                    <Text style={est.filaFecha}>
                      {fechaHora(t?.fechaCreacion)} · {t?.tipoActor ?? user?.role}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={est.filaMonto}>+ {moneda(t?.montoComision ?? 0)}</Text>
                    <Pildora texto={String(t?.estado ?? estado)} color={colorEstado(t?.estado ?? estado)} />
                  </View>
                </Tarjeta>
              ))}
            </View>
          )}
        </View>
      )}
    </Pantalla>
  )
}

const est = StyleSheet.create({
  total: { padding: 16 },
  totalEtiqueta: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, color: color.text3 },
  totalValor: { fontSize: 22, fontWeight: '800', marginTop: 8, letterSpacing: -0.5 },
  seccion: { fontSize: 14.5, fontWeight: '800', color: color.text, marginTop: 10 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.white,
  },
  chipOn: { backgroundColor: color.primary, borderColor: color.primary },
  fila: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  filaPoliza: { fontSize: 13.5, fontWeight: '800', color: color.text },
  filaFecha: { fontSize: 11, color: color.text3, marginTop: 2 },
  filaMonto: { fontSize: 14, fontWeight: '800', color: color.success },
})
