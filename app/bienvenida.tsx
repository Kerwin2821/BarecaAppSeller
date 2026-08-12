import { useRef, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { marcarOnboardingVisto } from '@/lib/onboarding'
import { Boton } from '@/components/Ui'
import { color } from '@/lib/tema'

/**
 * Carrusel de bienvenida (solo el primer arranque, antes del login). Información
 * comercial del app, con las ilustraciones de marca (multiemisor + IA).
 */
const SLIDES: { img: number; titulo: string; desc: string }[] = [
  {
    img: require('../assets/bienvenida/1.png'),
    titulo: 'El primer multiemisor de Venezuela',
    desc: 'Vende RCV de Bareca y emite con varias aseguradoras aliadas desde un solo lugar.',
  },
  {
    img: require('../assets/bienvenida/2.png'),
    titulo: 'Cobra tu comisión en tiempo real',
    desc: 'Cotiza y emite en minutos; consulta y retira tu comisión al instante, sin esperas.',
  },
  {
    img: require('../assets/bienvenida/3.png'),
    titulo: 'Impulsado por inteligencia artificial',
    desc: 'Usamos IA para agilizar y mejorar cada paso de tu proceso de venta.',
  },
]

/**
 * `onDone` se usa cuando el carrusel se muestra INLINE desde el Guardia (primer
 * arranque): al terminar no navegamos, solo avisamos para que el Guardia deje de
 * mostrarlo. Cuando se abre como ruta ("Ver introducción"), `onDone` va vacío y
 * simplemente volvemos al login.
 */
export default function Bienvenida({ onDone }: { onDone?: () => void }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const scroller = useRef<ScrollView>(null)
  const [idx, setIdx] = useState(0)
  const ultima = idx === SLIDES.length - 1

  const finalizar = async () => {
    await marcarOnboardingVisto()
    if (onDone) onDone()
    else router.replace('/login')
  }
  const siguiente = () => {
    if (ultima) return finalizar()
    scroller.current?.scrollTo({ x: (idx + 1) * width, animated: true })
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.white }}>
      {/* Saltar */}
      <View style={[est.top, { paddingTop: insets.top + 10 }]}>
        {!ultima ? (
          <Pressable onPress={finalizar} hitSlop={10}>
            <Text style={est.saltar}>Saltar</Text>
          </Pressable>
        ) : (
          <View style={{ height: 18 }} />
        )}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={[est.slide, { width }]}>
            <Image source={s.img} resizeMode="contain" style={est.ilustracion} />
            <Text style={est.titulo}>{s.titulo}</Text>
            <Text style={est.desc}>{s.desc}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Puntos + botón */}
      <View style={[est.bottom, { paddingBottom: insets.bottom + 18 }]}>
        <View style={est.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[est.dot, i === idx && est.dotActivo]} />
          ))}
        </View>
        <Boton texto={ultima ? 'Comenzar' : 'Siguiente'} variante="accent" onPress={siguiente} style={{ paddingVertical: 14 }} />
      </View>
    </View>
  )
}

const est = StyleSheet.create({
  top: { alignItems: 'flex-end', paddingHorizontal: 22, paddingBottom: 4, minHeight: 30 },
  saltar: { fontSize: 13, fontWeight: '700', color: color.text3 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  ilustracion: { width: '100%', height: 340, marginBottom: 26 },
  titulo: { fontSize: 22, fontWeight: '900', color: color.text, textAlign: 'center', letterSpacing: -0.4 },
  desc: { fontSize: 14, color: color.text2, textAlign: 'center', lineHeight: 21, marginTop: 12 },
  bottom: { paddingHorizontal: 22, gap: 18 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.border },
  dotActivo: { width: 22, backgroundColor: color.accent },
})
