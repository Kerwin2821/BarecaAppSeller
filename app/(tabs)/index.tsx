import { useCallback, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { api, normalizarPagina } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { usePortal } from '@/components/PortalContexto'
import { decimal, fechaRelativa, numero, porcentaje, variacion } from '@/lib/formato'
import { colorDeCriterio, colorDeIndice, etiquetaDeCriterio, resolverCriterio } from '@/lib/criterio'
import type { InspeccionItem } from '@/lib/tipos'
import type { PuntoSerie } from '@/components/Charts'
import { AnilloProgreso, GraficoDona, GraficoLineas, LeyendaDona, PulsoVivo } from '@/components/Charts'
import { CargandoBloque, EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Boton, Pildora, Tarjeta } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

type Modo = 'semanal' | 'mensual'

function TarjetaKpi({
  titulo,
  insignia,
  colorInsignia,
  fondoInsignia,
  insigniaNodo,
  children,
}: {
  titulo: string
  insignia?: string
  colorInsignia?: string
  fondoInsignia?: string
  insigniaNodo?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Tarjeta style={est.kpi}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={est.kpiTitulo}>{titulo}</Text>
        {insigniaNodo ??
          (insignia ? (
            <View style={[est.kpiInsignia, { backgroundColor: fondoInsignia ?? color.navyTint }]}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: colorInsignia ?? color.navy, fontFamily: fuenteMono }}>
                {insignia}
              </Text>
            </View>
          ) : null)}
      </View>
      {children}
    </Tarjeta>
  )
}

function EsqueletoKpis() {
  return (
    <View style={est.kpiGrid}>
      {[0, 1, 2, 3].map((i) => (
        <Tarjeta key={i} style={est.kpi}>
          <Skeleton w="70%" h={11} />
          <Skeleton w="55%" h={30} style={{ marginTop: 14 }} />
          <Skeleton w="80%" h={11} style={{ marginTop: 12 }} />
        </Tarjeta>
      ))}
    </View>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const { dashboard, cargandoDashboard, errorDashboard, recargarDashboard } = usePortal()
  const [modo, setModo] = useState<Modo>('semanal')

  const abrirExpediente = (id: string) => router.push(`/inspecciones/${id}`)

  const cargarRecientes = useCallback(
    (signal: AbortSignal) => api.inspecciones({ page: 0, size: 7 }, signal),
    [],
  )
  const recientes = useApi(cargarRecientes)
  const listaRecientes: InspeccionItem[] = useMemo(
    () => (recientes.datos ? normalizarPagina(recientes.datos).items : []),
    [recientes.datos],
  )

  const serie: PuntoSerie[] = useMemo(() => {
    const t = dashboard?.tendencia ?? []
    if (modo === 'semanal') return t.map((p) => ({ etiqueta: p.semana, valor: p.cantidad }))
    // "Mensual" agrupa la misma serie semanal en bloques de 4 semanas.
    const bloques: PuntoSerie[] = []
    for (let i = 0; i < t.length; i += 4) {
      const trozo = t.slice(i, i + 4)
      if (trozo.length === 0) continue
      bloques.push({
        etiqueta:
          trozo.length > 1 ? `${trozo[0].semana}–${trozo[trozo.length - 1].semana}` : trozo[0].semana,
        valor: trozo.reduce((a, p) => a + p.cantidad, 0),
      })
    }
    return bloques
  }, [dashboard?.tendencia, modo])

  const distribucion = dashboard?.asegurabilidad
  const totalDist = distribucion
    ? distribucion.aprobado + distribucion.revision + distribucion.rechazado
    : 0

  const segmentos = distribucion
    ? [
        { etiqueta: 'Aprobado', valor: distribucion.aprobado, color: colorDeCriterio('APROBADO') },
        { etiqueta: 'Revisión', valor: distribucion.revision, color: colorDeCriterio('REVISION') },
        { etiqueta: 'Rechazado', valor: distribucion.rechazado, color: colorDeCriterio('RECHAZADO') },
      ]
    : []

  if (errorDashboard) {
    return (
      <View style={{ padding: 16 }}>
        <EstadoError mensaje={errorDashboard} onReintentar={recargarDashboard} />
      </View>
    )
  }

  const colorIndice = colorDeIndice(dashboard?.indiceAsegurabilidad ?? null)
  const variacionPositiva = (dashboard?.variacionMes ?? 0) >= 0

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bgApp }}
      contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => {
            recargarDashboard()
            recientes.recargar()
          }}
          tintColor={color.orange}
        />
      }
    >
      {/* ── KPIs ──────────────────────────────────────────── */}
      {cargandoDashboard || !dashboard ? (
        <EsqueletoKpis />
      ) : (
        <View style={est.kpiGrid}>
          <TarjetaKpi titulo="TOTAL INSPECCIONES · MES" insignia="IN">
            <Text style={est.kpiValor}>{numero(dashboard.totalMes)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <View
                style={[
                  est.variacion,
                  { backgroundColor: variacionPositiva ? color.successBg : color.dangerBg },
                ]}
              >
                <Text
                  style={{
                    fontSize: 10.5,
                    fontWeight: '700',
                    color: variacionPositiva ? color.success : color.danger,
                  }}
                >
                  {variacionPositiva ? '▲' : '▼'} {variacion(dashboard.variacionMes)}
                </Text>
              </View>
              <Text style={est.kpiNota}>vs mes anterior</Text>
            </View>
          </TarjetaKpi>

          <TarjetaKpi
            titulo="ÍNDICE DE ASEGURABILIDAD"
            insignia="AS"
            colorInsignia={colorIndice}
            fondoInsignia={`${colorIndice}1A`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <AnilloProgreso
                valor={dashboard.indiceAsegurabilidad}
                size={50}
                grosor={7}
                color={colorIndice}
                texto={`${Math.round(dashboard.indiceAsegurabilidad)}%`}
              />
              <View style={{ flex: 1 }}>
                <Text style={[est.kpiValor, { fontSize: 21, marginTop: 0 }]}>
                  {porcentaje(dashboard.indiceAsegurabilidad)}
                </Text>
                <Text style={est.kpiNota}>promedio de flota</Text>
              </View>
            </View>
          </TarjetaKpi>

          <TarjetaKpi titulo="TIEMPO PROMEDIO / PERITAJE" insignia="TP">
            <Text style={est.kpiValor}>
              {decimal(dashboard.tiempoPromedioMin, 0)}
              <Text style={{ fontSize: 14, color: color.text3 }}> min</Text>
            </Text>
            <Text style={[est.kpiNota, { marginTop: 6 }]}>Duración media de captura en campo</Text>
          </TarjetaKpi>

          <TarjetaKpi titulo="INSPECCIONES EN VIVO" insigniaNodo={<PulsoVivo />}>
            <Text style={[est.kpiValor, { color: color.orange }]}>{numero(dashboard.enVivo)}</Text>
            <Text style={[est.kpiNota, { marginTop: 6 }]}>Peritajes en curso ahora mismo</Text>
          </TarjetaKpi>
        </View>
      )}

      {/* ── Tendencia ─────────────────────────────────────── */}
      <Tarjeta style={{ padding: 18, marginTop: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={est.cardTitulo}>Tendencia de Inspecciones</Text>
            <Text style={est.cardSub}>
              {modo === 'semanal' ? `Últimas ${serie.length} semanas` : 'Agrupado en bloques de 4 semanas'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {(['semanal', 'mensual'] as Modo[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setModo(m)}
                style={[est.modoBtn, modo === m && { backgroundColor: color.navyTint }]}
              >
                <Text
                  style={{
                    fontSize: 10.5,
                    fontWeight: modo === m ? '700' : '600',
                    color: modo === m ? color.navy : color.text3,
                  }}
                >
                  {m === 'semanal' ? 'Semanal' : 'Mensual'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {cargandoDashboard ? (
          <Skeleton h={190} r={12} />
        ) : (
          <GraficoLineas
            puntos={serie}
            etiquetaUltimo={
              serie.length > 0
                ? `${numero(serie[serie.length - 1].valor)} ${modo === 'semanal' ? 'esta semana' : 'último bloque'}`
                : undefined
            }
          />
        )}
      </Tarjeta>

      {/* ── Criterio de asegurabilidad ────────────────────── */}
      <Tarjeta style={{ padding: 18, marginTop: 16 }}>
        <Text style={est.cardTitulo}>Criterio de Asegurabilidad</Text>
        <Text style={[est.cardSub, { marginBottom: 8 }]}>Distribución del mes en curso</Text>

        {cargandoDashboard || !distribucion ? (
          <CargandoBloque texto="Calculando distribución…" />
        ) : totalDist === 0 ? (
          <EstadoVacio titulo="Sin peritajes este mes" detalle="Aún no hay criterios emitidos." />
        ) : (
          <View style={{ alignItems: 'center' }}>
            <GraficoDona segmentos={segmentos} total={totalDist} />
            <LeyendaDona segmentos={segmentos} total={totalDist} />
          </View>
        )}
      </Tarjeta>

      {/* ── Inspecciones recientes ────────────────────────── */}
      <Tarjeta style={{ marginTop: 16, overflow: 'hidden' }}>
        <View style={est.recientesTop}>
          <View style={{ flex: 1 }}>
            <Text style={est.cardTitulo}>Inspecciones Recientes</Text>
            <Text style={est.cardSub}>Últimos peritajes registrados por Winspec</Text>
          </View>
          <Boton texto="Ver en mapa →" variante="ghost" onPress={() => router.push('/mapa')} />
        </View>

        {recientes.cargando ? (
          <CargandoBloque texto="Cargando inspecciones…" />
        ) : recientes.error ? (
          <View style={{ padding: 16 }}>
            <EstadoError mensaje={recientes.error} onReintentar={recientes.recargar} compacto />
          </View>
        ) : listaRecientes.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hay inspecciones"
            detalle="Cuando los inspectores registren peritajes aparecerán aquí."
          />
        ) : (
          listaRecientes.map((it) => {
            const criterio = resolverCriterio({ indice: it.indice, semaforo: it.semaforo })
            const c = colorDeCriterio(criterio)
            return (
              <Pressable
                key={it.id}
                onPress={() => abrirExpediente(it.id)}
                style={({ pressed }) => [est.fila, pressed && { backgroundColor: color.bgCard }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={est.filaVehiculo} numberOfLines={1}>
                    {it.vehiculo}
                  </Text>
                  <Text style={est.filaDetalle} numberOfLines={1}>
                    <Text style={{ fontFamily: fuenteMono, fontWeight: '700', color: color.navy }}>
                      {it.placa}
                    </Text>
                    {'  ·  '}
                    {it.codigo}
                    {it.inspector ? `  ·  ${it.inspector}` : ''}
                  </Text>
                  <Text style={[est.filaDetalle, { marginTop: 1 }]}>{fechaRelativa(it.creadaEn)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Pildora
                    color={c}
                    texto={`${etiquetaDeCriterio(criterio)}${it.indice !== null ? ` · ${decimal(it.indice, 0)}%` : ''}`}
                  />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: color.orange }}>Ver →</Text>
                </View>
              </Pressable>
            )
          })
        )}
      </Tarjeta>
    </ScrollView>
  )
}

const est = StyleSheet.create({
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: { padding: 16, width: '48%', flexGrow: 1 },
  kpiTitulo: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: color.text2, flex: 1, paddingRight: 6 },
  kpiInsignia: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  kpiValor: {
    fontSize: 28,
    fontWeight: '800',
    color: color.navy,
    letterSpacing: -0.8,
    marginTop: 10,
    fontFamily: fuenteMono,
  },
  kpiNota: { fontSize: 10.5, color: color.text3 },
  variacion: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 99 },
  cardTitulo: { fontSize: 14, fontWeight: '800', color: color.navy },
  cardSub: { fontSize: 11, color: color.text3, marginTop: 1 },
  modoBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99 },
  recientesTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 18,
    paddingBottom: 12,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: color.borderRow,
  },
  filaVehiculo: { fontSize: 13, fontWeight: '700', color: color.text },
  filaDetalle: { fontSize: 11, color: color.text2, marginTop: 2 },
})
