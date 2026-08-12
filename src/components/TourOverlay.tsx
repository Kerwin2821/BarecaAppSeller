/**
 * TourOverlay — capa visual de la visita guiada (coach-marks). Oscurece la pantalla,
 * abre un HUECO iluminado (spotlight) sobre el elemento activo y muestra una burbuja
 * con flecha que explica qué hace.
 *
 * Alineación a prueba de balas: en lugar de un Modal (otra ventana → el `measureInWindow`
 * puede desfasarse por la barra de estado en Android), el overlay es una `View` absoluta
 * en el MISMO árbol. Medimos el objetivo Y el propio overlay con `measureInWindow` y
 * restamos su origen → el hueco calza exacto con el elemento real. `elevation` alto para
 * dibujarse por encima de la barra inferior. (Se usa `measureInWindow`, no `measureLayout`,
 * que falla en Fabric.)
 */
import { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, Mask, Rect } from 'react-native-svg'
import { useTour } from '../lib/tour'
import { color } from '../lib/tema'

type Medida = { x: number; y: number; w: number; h: number }

const PAD = 8 // margen del foco alrededor del elemento
const RADIO = 16 // esquinas del foco
const MARGEN = 16 // margen lateral de la burbuja
const REINTENTOS = 14 // ~840ms esperando a que el objetivo se pueda medir

export function TourOverlay() {
  const { activo, pasos, indice, siguiente, anterior, terminar, refDe } = useTour()
  const paso = pasos[indice]
  const rootRef = useRef<View>(null)
  const [tam, setTam] = useState({ w: 0, h: 0 })
  const [medida, setMedida] = useState<Medida | null>(null)
  const anim = useRef(new Animated.Value(0)).current

  // Mide el objetivo del paso (relativo al overlay) con reintentos; si no se puede medir
  // (elemento ausente/oculto), salta para no trabar el recorrido.
  useEffect(() => {
    if (!activo || !paso) return
    let cancelado = false
    let intentos = 0
    setMedida(null)
    anim.setValue(0)

    const avanzar = () => {
      if (cancelado) return
      if (indice < pasos.length - 1) siguiente()
      else terminar()
    }
    const reintentar = () => {
      if (intentos++ < REINTENTOS) setTimeout(medir, 60)
      else avanzar()
    }
    const medir = () => {
      if (cancelado) return
      const root = rootRef.current as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null
      const target = refDe(paso.id)?.current as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | undefined
      if (!root?.measureInWindow || !target?.measureInWindow) {
        reintentar()
        return
      }
      root.measureInWindow((ox, oy) => {
        if (cancelado) return
        target.measureInWindow!((tx, ty, tw, th) => {
          if (cancelado) return
          if (tw === 0 || th === 0) {
            reintentar()
            return
          }
          setMedida({ x: tx - ox, y: ty - oy, w: tw, h: th })
          Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }).start()
        })
      })
    }

    const t = setTimeout(medir, 90)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, indice, paso?.id])

  if (!activo || !paso) return null

  const W = tam.w
  const H = tam.h

  // Foco (elemento + padding), acotado al overlay.
  const fx = medida ? Math.max(6, medida.x - PAD) : 0
  const fy = medida ? Math.max(6, medida.y - PAD) : 0
  const fw = medida ? Math.min((W || 9999) - 12, medida.w + PAD * 2) : 0
  const fh = medida ? medida.h + PAD * 2 : 0
  const focoCentroX = fx + fw / 2
  const focoAbajoY = fy + fh

  // Burbuja: debajo del foco si está en la mitad superior; encima si no.
  const colocarAbajo = medida ? focoAbajoY < H * 0.58 : true
  const ultimo = indice >= pasos.length - 1
  const primero = indice <= 0
  const flechaLeft = Math.max(14, Math.min((W || 320) - MARGEN * 2 - 34, focoCentroX - MARGEN - 9))

  const animEstilo = {
    opacity: anim,
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
  }

  return (
    <View
      ref={rootRef}
      collapsable={false}
      onLayout={(e) => setTam({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]}
    >
      {W > 0 ? (
        <>
          {/* Spotlight: velo oscuro con hueco sobre el elemento */}
          <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <Mask id="hueco">
                <Rect x={0} y={0} width={W} height={H} fill="#fff" />
                {medida ? <Rect x={fx} y={fy} width={fw} height={fh} rx={RADIO} ry={RADIO} fill="#000" /> : null}
              </Mask>
            </Defs>
            <Rect x={0} y={0} width={W} height={H} fill="rgba(9,12,28,0.82)" mask="url(#hueco)" />
          </Svg>

          {/* Borde de acento sobre el foco */}
          {medida ? (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: fx, top: fy, width: fw, height: fh, borderRadius: RADIO, borderWidth: 2.5, borderColor: color.accent }}
            />
          ) : null}

          {/* Bloquea la UI real (no cierra por toque afuera) */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} />

          {/* Burbuja / callout */}
          {medida ? (
            <Animated.View
              style={[est.wrap, colocarAbajo ? { top: focoAbajoY + 14 } : { bottom: H - fy + 14 }, animEstilo]}
            >
              {colocarAbajo ? <View style={[est.flecha, est.flechaArriba, { left: flechaLeft }]} /> : null}
              <View style={est.card}>
                <View style={est.filaTop}>
                  <Text style={est.contador}>
                    {indice + 1} / {pasos.length}
                  </Text>
                  <Pressable onPress={terminar} hitSlop={10}>
                    <Text style={est.saltar}>Saltar</Text>
                  </Pressable>
                </View>
                <Text style={est.titulo}>
                  {paso.emoji ? `${paso.emoji}  ` : ''}
                  {paso.titulo}
                </Text>
                <Text style={est.desc}>{paso.desc}</Text>

                <View style={est.dots}>
                  {pasos.map((_, k) => (
                    <View key={k} style={[est.dot, k === indice && est.dotOn]} />
                  ))}
                </View>

                <View style={est.acciones}>
                  {!primero ? (
                    <Pressable onPress={anterior} style={[est.btn, est.btnSoft]} hitSlop={6}>
                      <Text style={est.btnSoftTxt}>Atrás</Text>
                    </Pressable>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                  <Pressable onPress={ultimo ? terminar : siguiente} style={[est.btn, est.btnAccent]} hitSlop={6}>
                    <Text style={est.btnAccentTxt}>{ultimo ? 'Finalizar' : 'Siguiente ›'}</Text>
                  </Pressable>
                </View>
              </View>
              {!colocarAbajo ? <View style={[est.flecha, est.flechaAbajo, { left: flechaLeft }]} /> : null}
            </Animated.View>
          ) : null}
        </>
      ) : null}
    </View>
  )
}

const est = StyleSheet.create({
  wrap: { position: 'absolute', left: MARGEN, right: MARGEN },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: '#0B1220',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 24,
  },
  flecha: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  flechaArriba: { top: -9, borderBottomWidth: 10, borderBottomColor: '#fff' },
  flechaAbajo: { bottom: -9, borderTopWidth: 10, borderTopColor: '#fff' },
  filaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  contador: { fontSize: 11, fontWeight: '800', color: color.accent, letterSpacing: 0.5 },
  saltar: { fontSize: 12, fontWeight: '700', color: color.text3 },
  titulo: { fontSize: 17, fontWeight: '900', color: color.text, marginTop: 6, letterSpacing: -0.3 },
  desc: { fontSize: 13, color: color.text2, lineHeight: 19, marginTop: 5 },
  dots: { flexDirection: 'row', gap: 5, marginTop: 12, flexWrap: 'wrap' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.border },
  dotOn: { width: 16, backgroundColor: color.accent },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  btn: { borderRadius: 11, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnSoft: { backgroundColor: color.bgApp, flex: 1 },
  btnSoftTxt: { fontSize: 13.5, fontWeight: '800', color: color.text2 },
  btnAccent: { backgroundColor: color.accent, flex: 1.4 },
  btnAccentTxt: { fontSize: 13.5, fontWeight: '900', color: '#fff' },
})
