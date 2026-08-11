import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native'
import { color } from '../lib/tema'

/** Aseguradoras integradas (logos empaquetados en el app). */
const LOGOS = [
  require('../../assets/logos/logo-caroni-blanco.png'),
  require('../../assets/logos/logo-estar-seguros.png'),
  require('../../assets/logos/logo-laoccidental.png'),
]

function Fila({ onAncho }: { onAncho?: (w: number) => void }) {
  return (
    <View
      style={est.fila}
      onLayout={onAncho ? (e) => onAncho(e.nativeEvent.layout.width) : undefined}
    >
      {LOGOS.map((src, i) => (
        <View key={i} style={est.chip}>
          <Image source={src} resizeMode="contain" style={{ height: 26, width: 96 }} />
        </View>
      ))}
    </View>
  )
}

/** Banner con desplazamiento automático (marquee) de las aseguradoras integradas. */
export function BannerAseguradoras() {
  const x = useRef(new Animated.Value(0)).current
  const [ancho, setAncho] = useState(0)

  useEffect(() => {
    if (ancho <= 0) return
    x.setValue(0)
    const anim = Animated.loop(
      Animated.timing(x, {
        toValue: -ancho,
        duration: Math.max(4000, Math.round(ancho * 22)),
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    anim.start()
    return () => anim.stop()
  }, [ancho, x])

  return (
    <View style={est.wrap}>
      <Text style={est.titulo}>Aseguradoras integradas</Text>
      <View style={est.pista}>
        <Animated.View style={[est.track, { transform: [{ translateX: x }] }]}>
          <Fila onAncho={setAncho} />
          <Fila />
        </Animated.View>
      </View>
    </View>
  )
}

const est = StyleSheet.create({
  wrap: { marginTop: 18 },
  titulo: { fontSize: 11.5, fontWeight: '700', color: color.text3, letterSpacing: 0.3, marginBottom: 8 },
  pista: { height: 46, overflow: 'hidden', justifyContent: 'center' },
  track: { flexDirection: 'row' },
  fila: { flexDirection: 'row', gap: 10, paddingRight: 10 },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.borderSoft,
    paddingHorizontal: 12,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
