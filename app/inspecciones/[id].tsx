import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { VideoView, useVideoPlayer } from 'expo-video'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { api, mensajeDeError, resolverUrl } from '@/lib/api'
import { cabecerasMedia } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { useFuenteMedia } from '@/hooks/useMedia'
import { decimal, etiquetaGrupo, fechaHora, numero, tituloToma } from '@/lib/formato'
import {
  colorDeCriterio,
  colorDeIndice,
  etiquetaDeCriterio,
  nivelHallazgo,
  resolverCriterio,
} from '@/lib/criterio'
import type { Expediente as ExpedienteDto, Foto } from '@/lib/tipos'
import { AnilloProgreso, BarraPuntaje } from '@/components/Charts'
import { CargandoBloque, EstadoError, EstadoVacio, Skeleton, Spinner } from '@/components/Estados'
import { useToast } from '@/components/Toast'
import { Boton, Chip, Pildora, Tarjeta, TituloSeccion } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

/* ══════════════════════════════════════════════════════════
   Media protegida (se pide con el header de autenticación)
   ══════════════════════════════════════════════════════════ */

function FotoGrande({ foto }: { foto: Foto | null }) {
  const fuente = useFuenteMedia(foto?.url)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setCargando(true)
    setError(false)
  }, [foto?.url])

  if (!foto) {
    return (
      <View style={[est.fotoGrande, est.trama]}>
        <Text style={{ fontSize: 12, color: color.text2 }}>
          Este peritaje no tiene evidencia fotográfica.
        </Text>
      </View>
    )
  }

  return (
    <View style={[est.fotoGrande, { backgroundColor: '#0F1330' }]}>
      {fuente && !error ? (
        <Image
          source={fuente}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          transition={150}
          onLoadStart={() => setCargando(true)}
          onLoad={() => setCargando(false)}
          onError={() => {
            setCargando(false)
            setError(true)
          }}
        />
      ) : null}
      {cargando && !error ? (
        <View style={est.fotoVelo}>
          <Spinner claro />
        </View>
      ) : null}
      {error ? (
        <View style={est.fotoVelo}>
          <Text style={{ fontSize: 12, color: '#FECACA', textAlign: 'center', padding: 14 }}>
            No se pudo cargar la foto.
          </Text>
        </View>
      ) : null}
      <View style={est.fotoEtiqueta}>
        <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#FFFFFF', fontFamily: fuenteMono }}>
          {foto.titulo || tituloToma(foto.shot)}
        </Text>
      </View>
    </View>
  )
}

function Miniatura({ foto, activa, onPress }: { foto: Foto; activa: boolean; onPress: () => void }) {
  const fuente = useFuenteMedia(foto.url)
  const etiqueta = foto.titulo || tituloToma(foto.shot)

  return (
    <Pressable
      onPress={onPress}
      style={[est.miniatura, activa ? { borderColor: color.orange, borderWidth: 2 } : null]}
    >
      {fuente ? (
        <Image source={fuente} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, est.trama]} />
      )}
      <View style={est.miniaturaPie}>
        <Text numberOfLines={1} style={{ fontSize: 8.5, color: '#FFFFFF' }}>
          {etiqueta}
        </Text>
      </View>
    </Pressable>
  )
}

function Reproductor({ videoUrl }: { videoUrl: string }) {
  const fuente = useMemo(
    () => ({ uri: resolverUrl(videoUrl), headers: cabecerasMedia() }),
    [videoUrl],
  )
  const player = useVideoPlayer(fuente)

  return (
    <View style={est.video}>
      <VideoView
        player={player}
        style={{ width: '100%', height: 230, borderRadius: 10 }}
        nativeControls
        allowsFullscreen
        contentFit="contain"
      />
    </View>
  )
}

/* ══════════════════════════════════════════════════════════
   Expediente digital
   ══════════════════════════════════════════════════════════ */

export default function Expediente() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { avisar } = useToast()
  const { width } = useWindowDimensions()

  const [indiceFoto, setIndiceFoto] = useState(0)
  const [bajandoPdf, setBajandoPdf] = useState(false)

  const cargar = useCallback(
    (signal: AbortSignal) => api.expediente(String(id), signal),
    [id],
  )
  const { datos, cargando, error, recargar } = useApi<ExpedienteDto>(cargar, [id])

  useEffect(() => setIndiceFoto(0), [id])

  const exp = datos
  const criterio = useMemo(
    () =>
      resolverCriterio({
        criterio: exp?.asegurabilidad?.criterio ?? null,
        indice: exp?.asegurabilidad?.porcentaje ?? exp?.indice ?? null,
        semaforo: exp?.semaforo ?? null,
      }),
    [exp],
  )

  const puntaje = exp?.asegurabilidad?.porcentaje ?? exp?.indice ?? null
  const c = puntaje !== null ? colorDeIndice(puntaje) : colorDeCriterio(criterio)

  const cerrar = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }

  const descargarPdf = async () => {
    if (bajandoPdf || !exp) return
    setBajandoPdf(true)
    try {
      const destino = `${FileSystem.cacheDirectory}peritaje-${exp.codigo ?? id}.pdf`
      const r = await FileSystem.downloadAsync(api.urlReportePdf(String(id)), destino, {
        headers: cabecerasMedia(),
      })
      if (r.status !== 200) {
        throw new Error(`El servidor respondió ${r.status}.`)
      }
      // Una respuesta HTML significa que la ruta no llegó al API y contestó el
      // fallback del SPA: el archivo se guardaría igual pero no sería un PDF.
      const tipo = r.headers['Content-Type'] ?? r.headers['content-type'] ?? ''
      if (tipo.includes('text/html')) {
        throw new Error('El servidor devolvió una página en lugar del archivo.')
      }
      if (await Sharing.isAvailableAsync()) {
        avisar('Informe descargado. Elija dónde guardarlo…', 'info')
        await Sharing.shareAsync(r.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `peritaje-${exp.codigo}.pdf`,
        })
      } else {
        avisar(`Informe guardado en el dispositivo`, 'ok')
      }
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    } finally {
      setBajandoPdf(false)
    }
  }

  if (cargando) {
    return (
      <View style={{ flex: 1, backgroundColor: color.white, padding: 26, paddingTop: insets.top + 26 }}>
        <Skeleton w="40%" h={14} />
        <Skeleton w="60%" h={26} style={{ marginTop: 12 }} />
        <Skeleton h={280} r={14} style={{ marginTop: 24 }} />
        <CargandoBloque texto="Cargando expediente…" />
      </View>
    )
  }

  if (error || !exp) {
    return (
      <View style={{ flex: 1, backgroundColor: color.white, padding: 26, paddingTop: insets.top + 26 }}>
        <EstadoError mensaje={error ?? 'Expediente no disponible.'} onReintentar={recargar} />
        <Boton texto="Volver" variante="soft" onPress={cerrar} style={{ marginTop: 14 }} />
      </View>
    )
  }

  const fotos = exp.fotos ?? []
  const fotoActual = fotos[Math.min(indiceFoto, Math.max(fotos.length - 1, 0))] ?? null
  const hallazgos = exp.hallazgos ?? []
  const grupos = exp.grupos ?? []
  const leyendas = exp.leyendas ?? []
  const banderas = exp.banderas ?? []
  const criticos = hallazgos.filter((h) => h.nivel >= 3).length
  const columnasMini = Math.min(Math.max(fotos.length, 4), 8)
  const anchoMini = (width - 60 - (columnasMini - 1) * 8) / columnasMini

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.white }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 34 }}
    >
      {/* ── Encabezado ────────────────────────────────────── */}
      <View style={[est.encabezado, { paddingTop: insets.top + 18 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={est.codigo}>{exp.codigo} · EXPEDIENTE DIGITAL</Text>
            <Text style={est.vehiculo}>{exp.vehiculo}</Text>
            <Text style={est.linea}>
              Placa <Text style={{ fontWeight: '700', color: color.navy }}>{exp.placa}</Text> · VIN{' '}
              <Text style={{ fontFamily: fuenteMono, fontSize: 11 }}>{exp.vin}</Text>
            </Text>
            {exp.direccion ? <Text style={est.linea}>{exp.direccion}</Text> : null}
            <Text style={est.linea}>{fechaHora(exp.creadaEn)}</Text>
          </View>

          <View style={{ alignItems: 'center' }}>
            <AnilloProgreso
              valor={puntaje ?? 0}
              size={88}
              grosor={9}
              color={c}
              texto={puntaje !== null ? `${decimal(puntaje, 0)}%` : '—'}
              tamTexto={18}
            />
            <Text style={est.score}>SCORE</Text>
            <View style={[est.criterio, { backgroundColor: c }]}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>
                {etiquetaDeCriterio(criterio)}
              </Text>
            </View>
          </View>

          <Pressable onPress={cerrar} style={est.cerrar}>
            <Text style={{ fontSize: 14, color: color.text2 }}>✕</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <Chip texto={exp.estado} fondo={color.navy} colorTexto="#FFFFFF" />
          {exp.inspector ? <Chip texto={`Inspector: ${exp.inspector}`} /> : null}
          {exp.confianza !== null && exp.confianza !== undefined ? (
            <Chip texto={`Confianza: ${decimal(exp.confianza, 0)}%`} />
          ) : null}
          <Chip
            texto={
              criticos
                ? `${numero(criticos)} hallazgo(s) crítico(s)`
                : hallazgos.length
                  ? `${numero(hallazgos.length)} hallazgo(s)`
                  : 'Sin hallazgos detectados'
            }
            fondo={criticos ? `${color.danger}14` : hallazgos.length ? `${color.amber}14` : `${color.success}14`}
            colorTexto={criticos ? color.danger : hallazgos.length ? color.amber : color.success}
          />
        </View>
      </View>

      {/* ── Cuerpo ────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
        <Text style={est.seccionPrimera}>Galería de Evidencia</Text>
        <FotoGrande foto={fotoActual} />
        {fotos.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {fotos.map((f, i) => (
              <View key={f.id} style={{ width: anchoMini }}>
                <Miniatura foto={f} activa={i === indiceFoto} onPress={() => setIndiceFoto(i)} />
              </View>
            ))}
          </View>
        )}

        <TituloSeccion>Video de la Inspección</TituloSeccion>
        {exp.videoUrl ? (
          <Reproductor videoUrl={exp.videoUrl} />
        ) : (
          <View style={est.sinVideo}>
            <Text style={{ fontSize: 12.5, color: color.text2, textAlign: 'center' }}>
              Este peritaje no incluye video de recorrido.
            </Text>
          </View>
        )}

        <TituloSeccion>Evaluación Pieza por Pieza</TituloSeccion>
        {hallazgos.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              titulo="Sin hallazgos registrados"
              detalle="El análisis no reportó daños ni desgastes en las piezas evaluadas."
            />
          </Tarjeta>
        ) : (
          <View style={est.tablaHallazgos}>
            {hallazgos.map((h, i) => {
              const n = nivelHallazgo(h.nivel)
              return (
                <View
                  key={`${h.piezaId}-${i}`}
                  style={[est.hallazgo, i > 0 && { borderTopWidth: 1, borderTopColor: color.borderRow }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[est.puntoNivel, { backgroundColor: n.color }]} />
                    <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: color.text }}>
                      {h.pieza || h.piezaId}
                    </Text>
                    <Pildora color={n.color} texto={`${h.nivel} · ${n.texto}`} />
                  </View>
                  <Text style={{ fontSize: 11, color: color.text2, marginTop: 4, marginLeft: 17 }}>
                    {etiquetaGrupo(h.grupo)} · {h.tipo}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: color.text, marginTop: 3, marginLeft: 17 }}>
                    {h.descripcion}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {grupos.length > 0 && (
          <>
            <TituloSeccion>Puntajes por Grupo</TituloSeccion>
            <Tarjeta style={{ padding: 18, gap: 14 }}>
              {grupos.map((g) => (
                <View key={g.grupo}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: color.text }}>
                      {etiquetaGrupo(g.grupo)}
                      <Text style={{ fontWeight: '500', color: color.text3 }}> · peso {g.peso}%</Text>
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: colorDeIndice(g.puntaje),
                        fontFamily: fuenteMono,
                      }}
                    >
                      {decimal(g.puntaje, 0)}%
                    </Text>
                  </View>
                  <BarraPuntaje valor={g.puntaje} color={colorDeIndice(g.puntaje)} />
                </View>
              ))}
            </Tarjeta>
          </>
        )}

        {(leyendas.length > 0 || banderas.length > 0) && (
          <>
            <TituloSeccion>Observaciones del Peritaje</TituloSeccion>
            <View style={{ gap: 8 }}>
              {banderas.map((b) => (
                <View key={b} style={[est.alerta, { backgroundColor: color.dangerBg, borderColor: color.dangerBorder }]}>
                  <Text style={{ fontSize: 12, color: color.danger, lineHeight: 17.5 }}>{b}</Text>
                </View>
              ))}
              {leyendas.map((l) => (
                <View key={l} style={[est.alerta, { backgroundColor: color.navyTint, borderColor: color.navyTint2 }]}>
                  <Text style={{ fontSize: 12, color: color.navy, lineHeight: 17.5 }}>{l}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Informe PDF ─────────────────────────────────── */}
        <View style={est.pdf}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <View style={est.pdfIcono}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: color.orange, fontFamily: fuenteMono }}>
                PDF
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: color.navy }}>
                Informe Oficial de Peritaje
              </Text>
              <Text style={{ fontSize: 11, color: color.text2, fontFamily: fuenteMono }} numberOfLines={1}>
                peritaje-{exp.codigo}.pdf
              </Text>
            </View>
          </View>
        </View>
        <Boton
          texto={bajandoPdf ? 'Generando…' : '⬇ Descargar PDF del peritaje'}
          variante="navy"
          onPress={descargarPdf}
          cargando={bajandoPdf}
          style={{ marginTop: 10 }}
        />
      </View>
    </ScrollView>
  )
}

const est = StyleSheet.create({
  encabezado: {
    backgroundColor: color.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
  codigo: { fontSize: 11, fontWeight: '700', color: color.orange, letterSpacing: 0.5, fontFamily: fuenteMono },
  vehiculo: { fontSize: 20, fontWeight: '800', color: color.navy, letterSpacing: -0.4, marginTop: 4 },
  linea: { fontSize: 12, color: color.text2, marginTop: 2 },
  score: { fontSize: 8.5, fontWeight: '700', color: color.text3, marginTop: 2 },
  criterio: { marginTop: 7, paddingVertical: 4, paddingHorizontal: 14, borderRadius: 99 },
  cerrar: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seccionPrimera: { fontSize: 13, fontWeight: '800', color: color.navy, marginBottom: 10 },
  fotoGrande: {
    height: 260,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.borderSoft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trama: { backgroundColor: '#F4F6FB', alignItems: 'center', justifyContent: 'center' },
  fotoVelo: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fotoEtiqueta: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: 'rgba(17,26,80,0.72)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 99,
  },
  miniatura: {
    height: 50,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: color.borderSoft,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  miniaturaPie: { backgroundColor: 'rgba(17,26,80,0.7)', paddingVertical: 2, paddingHorizontal: 3 },
  video: { backgroundColor: color.navy, borderRadius: 14, padding: 12 },
  sinVideo: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.borderInput,
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  tablaHallazgos: {
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: color.white,
  },
  hallazgo: { paddingVertical: 11, paddingHorizontal: 14 },
  puntoNivel: { width: 9, height: 9, borderRadius: 99 },
  alerta: { borderWidth: 1, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14 },
  pdf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
    backgroundColor: color.bgCard,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 14,
    padding: 15,
  },
  pdfIcono: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: color.orangeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
