import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { comisionApi } from '@/lib/endpoints'
import { desenvolver } from '@/lib/api'
import { actorUuid } from '@/lib/roles'
import { moneda } from '@/lib/formato'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { CargandoBloque, EstadoError, EstadoVacio } from '@/components/Estados'
import { Tarjeta } from '@/components/Ui'
import { color } from '@/lib/tema'

function TarjetaTotal({ etiqueta, valor, color: c }: { etiqueta: string; valor: number | undefined; color: string }) {
  return (
    <Tarjeta style={[est.total, { borderLeftColor: c, borderLeftWidth: 3 }]}>
      <Text style={est.totalEtiqueta}>{etiqueta}</Text>
      <Text style={[est.totalValor, { color: c }]}>{moneda(valor ?? 0)}</Text>
    </Tarjeta>
  )
}

export default function Comisiones() {
  const { user } = useAuth()

  const cargar = useCallback(async () => {
    if (!user) return null
    const uuid = actorUuid(user) ?? ''
    if (!uuid) return null
    const r = await comisionApi.totales(user.role, uuid)
    return desenvolver(r) as any
  }, [user])
  const { datos, cargando, error, recargar } = useApi<any>(cargar, [user?.loginId])

  const generado = datos?.totalGenerado ?? datos?.generado ?? datos?.total ?? datos?.montoTotal
  const pagado = datos?.totalPagado ?? datos?.pagado ?? datos?.montoPagado
  const pendiente = datos?.totalPendiente ?? datos?.pendiente ?? datos?.montoPendiente

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla titulo="Mis Comisiones" detalle="Resumen de comisiones generadas y pagadas" />

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : cargando ? (
        <CargandoBloque texto="Calculando comisiones…" />
      ) : !datos ? (
        <Tarjeta>
          <EstadoVacio titulo="Sin comisiones" detalle="Aún no hay comisiones registradas." />
        </Tarjeta>
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

          <Text style={est.nota}>
            Totales de{' '}
            <Text style={{ fontWeight: '700' }}>/api/users/comision-transaccion-items/v1/totales</Text> para tu
            actor ({user?.role}).
          </Text>
        </View>
      )}
    </Pantalla>
  )
}

const est = StyleSheet.create({
  total: { padding: 16 },
  totalEtiqueta: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, color: color.text3 },
  totalValor: { fontSize: 22, fontWeight: '800', marginTop: 8, letterSpacing: -0.5 },
  nota: { fontSize: 11.5, color: color.text3, marginTop: 6, lineHeight: 17 },
})
