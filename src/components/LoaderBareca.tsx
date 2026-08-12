import { useEffect, useRef } from 'react'
import { Animated, Easing, Image, View } from 'react-native'
import { color } from '../lib/tema'

const B = require('../../assets/logo-bareca-b.png') // «B» de Bareca (transparente)
const B_RATIO = 314 / 454 // ancho/alto del recorte

/**
 * Loader de marca Bareca: un anillo naranja girando alrededor de la «B».
 * Se usa en todas las esperas (arranque, carga de datos, bloques, etc.).
 */
export function LoaderBareca({ size = 56 }: { size?: number }) {
  const rot = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 950, easing: Easing.linear, useNativeDriver: true }),
    )
    anim.start()
    return () => anim.stop()
  }, [rot])

  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const grosor = Math.max(3, Math.round(size * 0.07))
  const bH = size * 0.5
  const bW = bH * B_RATIO

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: grosor,
          borderColor: color.primaryLight,
          borderTopColor: color.accent,
          transform: [{ rotate: spin }],
        }}
      />
      <Image source={B} resizeMode="contain" style={{ width: bW, height: bH }} />
    </View>
  )
}
