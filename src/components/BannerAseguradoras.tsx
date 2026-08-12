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
          <Image source={src} resizeMode="contain" style={{ height: 52, width: 164 }} />
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
        duration: Math.max(9000, Math.round(ancho * 45)),
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
  wrap: { marginTop: 14 },
  titulo: { fontSize: 11.5, fontWeight: '700', color: color.text3, letterSpacing: 0.3, marginBottom: 10 },
  pista: { height: 88, overflow: 'hidden', justifyContent: 'center' },
  track: { flexDirection: 'row' },
  fila: { flexDirection: 'row', gap: 14, paddingRight: 14 },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.borderSoft,
    paddingHorizontal: 24,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1C2150',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
})
