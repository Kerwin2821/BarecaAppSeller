import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { reportApi } from '@/lib/endpoints'
import { entidadIdPorRol } from '@/lib/roles'
import { moneda, numero } from '@/lib/formato'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { CargandoBloque, EstadoError } from '@/components/Estados'
import { Tarjeta } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

/** Reporte de pólizas: KPIs del BFF (`/reporte/kpis?perfil=&id=`). */
export default function Reporte() {
  const { user } = useAuth()
  const cargar = useCallback(async () => {
    const id = user ? entidadIdPorRol(user) : undefined
    if (!user || id === undefined) return {}
    const r = await reportApi.kpis(user.role, id)
    return (r?.data ?? {}) as Record<string, number>
  }, [user])
  const { datos, cargando, error, recargar } = useApi<Record<string, number>>(cargar, [user?.loginId])

  const totalPolizas = datos?.totalPolizas ?? datos?.total ?? datos?.cantidad
  const montoTotal = datos?.montoTotal ?? datos?.total_monto
  const primaTotal = datos?.primaTotal ?? datos?.prima
  const comisionTotal = datos?.comisionTotal ?? datos?.comision

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla titulo="Reporte de Pólizas" detalle="Indicadores de tu operación" />

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : cargando ? (
        <CargandoBloque texto="Cargando indicadores…" />
      ) : (
        <View style={est.grid}>
          <Kpi etiqueta="PÓLIZAS" valor={numero(totalPolizas ?? 0)} />
          <Kpi etiqueta="MONTO TOTAL" valor={moneda(montoTotal ?? 0)} />
          <Kpi etiqueta="PRIMA TOTAL" valor={moneda(primaTotal ?? 0)} />
          <Kpi etiqueta="COMISIÓN" valor={moneda(comisionTotal ?? 0)} />
        </View>
      )}

      {datos && Object.keys(datos).length > 0 ? (
        <Tarjeta style={{ padding: 16, marginTop: 14 }}>
          <Text style={est.crudoTitulo}>Detalle del reporte</Text>
          {Object.entries(datos).map(([k, v]) => (
            <View key={k} style={est.crudoFila}>
              <Text style={est.crudoClave}>{k}</Text>
              <Text style={est.crudoValor}>{typeof v === 'number' ? numero(v) : String(v)}</Text>
            </View>
          ))}
        </Tarjeta>
      ) : null}
    </Pantalla>
  )
}

function Kpi({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <Tarjeta style={est.kpi}>
      <Text style={est.kpiEtiqueta}>{etiqueta}</Text>
      <Text style={est.kpiValor}>{valor}</Text>
    </Tarjeta>
  )
}

const est = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: { padding: 16, width: '48%', flexGrow: 1 },
  kpiEtiqueta: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: color.text3 },
  kpiValor: { fontSize: 20, fontWeight: '800', color: color.text, marginTop: 8, letterSpacing: -0.4, fontFamily: fuenteMono },
  crudoTitulo: { fontSize: 12.5, fontWeight: '800', color: color.text, marginBottom: 8 },
  crudoFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: color.borderSoft },
  crudoClave: { fontSize: 12, color: color.text3 },
  crudoValor: { fontSize: 12.5, fontWeight: '600', color: color.text, fontFamily: fuenteMono },
})
