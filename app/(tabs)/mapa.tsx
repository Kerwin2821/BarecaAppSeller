import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import MapView, { Callout, Marker } from 'react-native-maps'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Image } from 'expo-image'
import { api } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { useFuenteMedia } from '@/hooks/useMedia'
import { decimal, fechaCorta, fechaRelativa, isoDia } from '@/lib/formato'
import {
  colorDeCriterio,
  etiquetaDeCriterio,
  etiquetaEstado,
  resolverCriterio,
} from '@/lib/criterio'
import type { Criterio, PuntoMapa } from '@/lib/tipos'
import { CargandoBloque, EstadoError, EstadoVacio } from '@/components/Estados'
import { Tarjeta } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

/** Centro por defecto: Gran Caracas (solo se usa si aún no hay puntos). */
const REGION_INICIAL = {
  latitude: 10.478,
  longitude: -66.87,
  latitudeDelta: 0.35,
  longitudeDelta: 0.35,
}

const FILTROS: { valor: 'TODOS' | Criterio; texto: string }[] = [
  { valor: 'TODOS', texto: 'Todos' },
  { valor: 'APROBADO', texto: 'Aprobado' },
  { valor: 'REVISION', texto: 'Revisión' },
  { valor: 'RECHAZADO', texto: 'Rechazado' },
]

function inicialesDe(nombre: string | null): string {
  if (!nombre) return '?'
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Pin de trabajo en curso: aro naranja con la foto del inspector (protegida,
 * va con el token) o sus iniciales. Espejo del iconoVivo del portal.
 */
function MarcadorVivo({ punto, color: c }: { punto: PuntoMapa; color: string }) {
  const fuente = useFuenteMedia(punto.responsableFoto)
  return (
    <View style={[est.pinVivo, { borderColor: c }]}>
      {fuente ? (
        <Image source={fuente} style={est.pinFoto} contentFit="cover" />
      ) : (
        <View style={[est.pinFoto, { backgroundColor: c, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>
            {inicialesDe(punto.responsable)}
          </Text>
        </View>
      )}
    </View>
  )
}

/** Selector de fecha como chip que abre el picker nativo. */
function SelectorFecha({
  etiqueta,
  valor,
  onCambiar,
  minimo,
  maximo,
}: {
  etiqueta: string
  valor: string
  onCambiar: (iso: string) => void
  minimo?: string
  maximo?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const fecha = useMemo(() => new Date(`${valor}T12:00:00`), [valor])

  return (
    <>
      <Pressable onPress={() => setAbierto(true)} style={est.chipFecha}>
        <Text style={{ fontSize: 10.5, color: color.text3 }}>{etiqueta}</Text>
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: color.navy, fontFamily: fuenteMono }}>
          {fechaCorta(fecha)}
        </Text>
      </Pressable>
      {abierto && (
        <DateTimePicker
          value={fecha}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={minimo ? new Date(`${minimo}T00:00:00`) : undefined}
          maximumDate={maximo ? new Date(`${maximo}T23:59:59`) : undefined}
          onChange={(evento, seleccionada) => {
            setAbierto(false)
            if (evento.type !== 'dismissed' && seleccionada) onCambiar(isoDia(seleccionada))
          }}
        />
      )}
    </>
  )
}

export default function Mapa() {
  const router = useRouter()
  const mapaRef = useRef<MapView>(null)

  const hoy = useMemo(() => new Date(), [])
  const hace30 = useMemo(() => new Date(Date.now() - 30 * 86400000), [])
  const [desde, setDesde] = useState(isoDia(hace30))
  const [hasta, setHasta] = useState(isoDia(hoy))
  const [filtro, setFiltro] = useState<'TODOS' | Criterio>('TODOS')

  const cargar = useCallback(
    (signal: AbortSignal) => api.mapa({ desde, hasta }, signal),
    [desde, hasta],
  )
  const { datos, cargando, error, recargar } = useApi<PuntoMapa[]>(cargar, [desde, hasta])

  // Mapa en vivo: mientras haya trabajo en curso se refresca solo cada 30 s
  // para ver moverse a los inspectores sin recargar la pantalla.
  const hayEnCurso = (datos ?? []).some((p) => p.enCurso)
  useEffect(() => {
    if (!hayEnCurso) return
    const id = setInterval(recargar, 30_000)
    return () => clearInterval(id)
  }, [hayEnCurso, recargar])

  const puntos = useMemo(() => {
    const base = (datos ?? []).filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
    if (filtro === 'TODOS') return base
    return base.filter((p) => resolverCriterio({ indice: p.indice, semaforo: p.semaforo }) === filtro)
  }, [datos, filtro])

  // Encuadra el mapa a los puntos disponibles (AjustarVista del portal).
  useEffect(() => {
    if (puntos.length === 0) return
    const id = setTimeout(() => {
      mapaRef.current?.fitToCoordinates(
        puntos.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true },
      )
    }, 350)
    return () => clearTimeout(id)
  }, [puntos])

  const irAPunto = (p: PuntoMapa) => {
    mapaRef.current?.animateToRegion(
      { latitude: p.lat, longitude: p.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      600,
    )
  }

  const abrir = (id: string) => router.push(`/inspecciones/${id}`)

  return (
    <View style={{ flex: 1, backgroundColor: color.bgApp }}>
      {/* ── Filtros y leyenda ─────────────────────────────── */}
      <View style={est.filtros}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Text style={est.leyendaTitulo}>LEYENDA</Text>
          {(['APROBADO', 'REVISION', 'RECHAZADO'] as Criterio[]).map((c) => (
            <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={[est.punto, { backgroundColor: colorDeCriterio(c) }]} />
              <Text style={{ fontSize: 11, color: color.text }}>{etiquetaDeCriterio(c)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={[est.punto, { backgroundColor: color.orange }]} />
            <Text style={{ fontSize: 11, color: color.text }}>En curso</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <SelectorFecha etiqueta="Desde" valor={desde} maximo={hasta} onCambiar={setDesde} />
          <SelectorFecha etiqueta="Hasta" valor={hasta} minimo={desde} onCambiar={setHasta} />
        </View>

        <View style={{ flexDirection: 'row', gap: 4, marginTop: 10 }}>
          {FILTROS.map((f) => (
            <Pressable
              key={f.valor}
              onPress={() => setFiltro(f.valor)}
              style={[est.filtroBtn, filtro === f.valor && { backgroundColor: color.navyTint }]}
            >
              <Text
                style={{
                  fontSize: 10.5,
                  fontWeight: filtro === f.valor ? '700' : '600',
                  color: filtro === f.valor ? color.navy : color.text3,
                }}
              >
                {f.texto}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error ? (
        <View style={{ padding: 16 }}>
          <EstadoError mensaje={error} onReintentar={recargar} />
        </View>
      ) : (
        <>
          {/* ── Mapa ──────────────────────────────────────── */}
          <View style={est.mapaMarco}>
            <MapView ref={mapaRef} style={{ flex: 1 }} initialRegion={REGION_INICIAL}>
              {puntos.map((p) => {
                const criterio = resolverCriterio({ indice: p.indice, semaforo: p.semaforo })
                // El trabajo en curso se pinta en naranja BARECA para
                // distinguirlo de un peritaje ya cerrado.
                const c = p.enCurso ? color.orange : colorDeCriterio(criterio)
                return (
                  <Marker
                    key={`${p.id}-${p.enCurso ? 'vivo' : 'fijo'}`}
                    coordinate={{ latitude: p.lat, longitude: p.lng }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                  >
                    {p.enCurso ? (
                      <MarcadorVivo punto={p} color={c} />
                    ) : (
                      <View style={[est.pin, { borderColor: c }]}>
                        <View style={[est.pinCentro, { backgroundColor: c }]} />
                      </View>
                    )}
                    <Callout tooltip={false} onPress={() => abrir(p.id)}>
                      <View style={est.callout}>
                        <Text style={{ fontSize: 13.5, fontWeight: '800', color: color.navy }}>
                          {p.vehiculo}
                        </Text>
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: c, marginTop: 2 }}>
                          {p.enCurso
                            ? `● En curso · ${etiquetaEstado(p.estado)}`
                            : `${etiquetaDeCriterio(criterio)}${p.indice !== null ? ` · ${decimal(p.indice, 0)}%` : ''}`}
                        </Text>
                        {p.responsable ? (
                          <Text style={est.calloutLinea}>Responsable: {p.responsable}</Text>
                        ) : null}
                        {p.ubicacionEn ? (
                          <Text style={[est.calloutLinea, { color: color.text3 }]}>
                            Posición del inspector · {fechaRelativa(p.ubicacionEn)}
                          </Text>
                        ) : null}
                        <Text style={est.calloutLinea}>Placa: {p.placa}</Text>
                        <Text style={est.calloutLinea}>Código: {p.codigo}</Text>
                        <Text style={est.calloutLinea}>Fecha: {fechaRelativa(p.creadaEn)}</Text>
                        <View style={est.calloutBtn}>
                          <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#FFFFFF' }}>
                            Ver Peritaje Completo →
                          </Text>
                        </View>
                      </View>
                    </Callout>
                  </Marker>
                )
              })}
            </MapView>
            {cargando && (
              <View style={est.velo}>
                <CargandoBloque texto="Cargando peritajes…" />
              </View>
            )}
          </View>

          {/* ── Lista de peritajes del período ────────────── */}
          <Tarjeta style={est.lista}>
            <View style={est.listaTop}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: color.navy }}>
                Peritajes en el período
              </Text>
              <Text style={{ fontSize: 10.5, color: color.text3 }}>
                {cargando ? 'Consultando…' : `${puntos.length} inspección(es) geolocalizada(s)`}
              </Text>
            </View>
            {!cargando && puntos.length === 0 ? (
              <EstadoVacio
                titulo="Sin peritajes en el período"
                detalle="Ajuste el rango de fechas o el filtro de criterio."
              />
            ) : (
              <FlatList
                data={puntos}
                keyExtractor={(p) => p.id}
                renderItem={({ item: p }) => {
                  const criterio = resolverCriterio({ indice: p.indice, semaforo: p.semaforo })
                  const c = p.enCurso ? color.orange : colorDeCriterio(criterio)
                  return (
                    <Pressable
                      onPress={() => irAPunto(p)}
                      style={({ pressed }) => [est.item, pressed && { backgroundColor: color.bgCard }]}
                    >
                      <View style={[est.punto, { backgroundColor: c, marginTop: 4 }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: color.text }} numberOfLines={1}>
                          {p.vehiculo}
                        </Text>
                        <Text style={{ fontSize: 10.5, color: color.text2, fontFamily: fuenteMono }}>
                          {p.placa} · {p.codigo}
                        </Text>
                        <Text style={{ fontSize: 10.5, color: color.text3 }}>{fechaRelativa(p.creadaEn)}</Text>
                        <Pressable onPress={() => abrir(p.id)} hitSlop={6}>
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: color.orange, marginTop: 4 }}>
                            Abrir expediente →
                          </Text>
                        </Pressable>
                      </View>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: c, fontFamily: fuenteMono }}>
                        {p.indice !== null ? `${decimal(p.indice, 0)}%` : '—'}
                      </Text>
                    </Pressable>
                  )
                }}
              />
            )}
          </Tarjeta>
        </>
      )}
    </View>
  )
}

const est = StyleSheet.create({
  filtros: {
    backgroundColor: color.white,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  leyendaTitulo: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, color: color.text3 },
  punto: { width: 9, height: 9, borderRadius: 99 },
  chipFecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 11,
    backgroundColor: color.white,
  },
  filtroBtn: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 99 },
  mapaMarco: { flex: 1.35, margin: 12, marginBottom: 6, borderRadius: 16, overflow: 'hidden' },
  velo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    width: 20,
    height: 20,
    borderRadius: 99,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  pinCentro: { width: 9, height: 9, borderRadius: 99 },
  pinVivo: {
    width: 40,
    height: 40,
    borderRadius: 99,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  pinFoto: { width: 30, height: 30, borderRadius: 99, overflow: 'hidden' },
  callout: { minWidth: 210, maxWidth: 250, padding: 4 },
  calloutLinea: { fontSize: 11, color: color.text2, marginTop: 2 },
  calloutBtn: {
    marginTop: 8,
    backgroundColor: color.orange,
    borderRadius: 9,
    paddingVertical: 8,
    alignItems: 'center',
  },
  lista: { flex: 1, margin: 12, marginTop: 6, overflow: 'hidden' },
  listaTop: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: color.borderRow,
  },
  item: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.borderRow,
    alignItems: 'flex-start',
  },
})
