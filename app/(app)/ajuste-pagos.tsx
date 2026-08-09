import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { comisionApi } from '@/lib/endpoints'
import { actorUuid } from '@/lib/roles'
import { moneda, fechaCorta } from '@/lib/formato'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Chip, Pildora, Tarjeta } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

/** Normaliza la respuesta del BFF a un arreglo (soporta `{data}`, `{content}` o `[]`). */
function aArreglo(r: any): any[] {
  if (Array.isArray(r)) return r
  if (Array.isArray(r?.data)) return r.data
  if (Array.isArray(r?.content)) return r.content
  if (Array.isArray(r?.data?.content)) return r.data.content
  return []
}

/** Convierte un enum backend ("EN_PROCESO") en texto legible ("En proceso"). */
function legible(s: string | null | undefined): string {
  if (!s) return '—'
  const limpio = s.replace(/_/g, ' ').trim().toLowerCase()
  if (!limpio) return '—'
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/** Color + etiqueta del estado de la orden de pago. */
function colorEstado(estado: string | null | undefined): { c: string; t: string } {
  const s = (estado ?? '').toUpperCase()
  if (s === 'PAGADA' || s === 'PAGADO' || s === 'PAID') return { c: color.success, t: 'Pagada' }
  if (s === 'PENDIENTE' || s === 'PENDING') return { c: color.warning, t: 'Pendiente' }
  return { c: color.text3, t: legible(estado) }
}

/** Etiqueta amigable del medio de pago. */
function medioLegible(m: string | null | undefined): string {
  const s = (m ?? '').toUpperCase()
  if (s === 'PAGO_MOVIL') return 'Pago móvil'
  if (s === 'TRANSFERENCIA') return 'Transferencia'
  if (s === 'EFECTIVO') return 'Efectivo'
  if (s === 'ZELLE') return 'Zelle'
  return legible(m)
}

/** ID corto (primeros 8 caracteres de un UUID) para mostrar en mono. */
function idCorto(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s) return '—'
  return s.length > 8 ? s.slice(0, 8) : s
}

export default function AjustePagos() {
  const { user } = useAuth()

  const cargar = useCallback(async () => {
    if (!user) return [] as any[]
    const uuid = actorUuid(user) ?? ''
    if (!uuid) return [] as any[]
    const r = await comisionApi.ordenesPago({ tipoActor: user.role, actorUuid: uuid })
    return aArreglo(r)
  }, [user])
  const { datos, cargando, error, recargar } = useApi<any[]>(cargar, [user?.loginId])

  const ordenes = datos ?? []

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla titulo="Ajuste de Pagos" detalle="Órdenes de pago de comisiones" />

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : cargando ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Tarjeta key={i} style={{ padding: 16 }}>
              <Skeleton w="45%" h={20} />
              <Skeleton w="30%" h={12} style={{ marginTop: 12 }} />
              <Skeleton w="70%" h={11} style={{ marginTop: 12 }} />
            </Tarjeta>
          ))}
        </View>
      ) : ordenes.length === 0 ? (
        <Tarjeta>
          <EstadoVacio titulo="Sin órdenes de pago" detalle="Aún no hay órdenes de pago de comisiones registradas." />
        </Tarjeta>
      ) : (
        <View style={{ gap: 12 }}>
          {ordenes.map((o, i) => {
            const id = o?.id ?? o?.pagoId ?? o?.pagoComisionOrdenId ?? o?.ordenId
            const monto = o?.montoTotal ?? o?.monto ?? o?.total ?? o?.montoPago
            const estado = o?.estadoPagoOrden ?? o?.estado ?? o?.status
            const medio = o?.medioPago ?? o?.metodoPago ?? o?.medio
            const fGen = o?.fechaGeneracion ?? o?.fechaCreacion ?? o?.createdAt
            const fPago = o?.fechaPago ?? o?.fechaProcesado
            const est = colorEstado(estado)
            return (
              <Tarjeta key={id ?? i} style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={stl.monto} numberOfLines={1}>
                      {moneda(typeof monto === 'number' ? monto : Number(monto))}
                    </Text>
                    {medio ? (
                      <View style={stl.chips}>
                        <Chip texto={medioLegible(medio)} />
                      </View>
                    ) : null}
                  </View>
                  <Pildora color={est.c} texto={est.t} />
                </View>

                <View style={stl.separador} />

                <View style={{ gap: 4 }}>
                  <View style={stl.filaMeta}>
                    <Text style={stl.metaEtiqueta}>Generada</Text>
                    <Text style={stl.metaValor}>{fechaCorta(fGen)}</Text>
                  </View>
                  <View style={stl.filaMeta}>
                    <Text style={stl.metaEtiqueta}>Pago</Text>
                    <Text style={stl.metaValor}>{fechaCorta(fPago)}</Text>
                  </View>
                  <View style={stl.filaMeta}>
                    <Text style={stl.metaEtiqueta}>Orden</Text>
                    <Text style={stl.metaId}>#{idCorto(id)}</Text>
                  </View>
                </View>
              </Tarjeta>
            )
          })}

          <Text style={stl.nota}>
            Vista de solo consulta: las órdenes de pago de comisiones se generan y procesan desde el back-office. Aquí
            únicamente puedes revisarlas.
          </Text>
        </View>
      )}
    </Pantalla>
  )
}

const stl = StyleSheet.create({
  monto: { fontSize: 22, fontWeight: '800', color: color.text, letterSpacing: -0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  separador: { height: 1, backgroundColor: color.borderSoft, marginVertical: 12 },
  filaMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaEtiqueta: { fontSize: 11.5, color: color.text3 },
  metaValor: { fontSize: 12, color: color.text2, fontWeight: '600' },
  metaId: { fontSize: 11.5, color: color.text3, fontFamily: fuenteMono },
  nota: { fontSize: 11.5, color: color.text3, marginTop: 6, lineHeight: 17 },
})
