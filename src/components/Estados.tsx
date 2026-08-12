import { useEffect, useRef, type ReactNode } from 'react'
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native'
import { color, radio } from '../lib/tema'
import { LoaderBareca } from './LoaderBareca'

export function Spinner({ size = 'small', claro = false }: { size?: number | 'small' | 'large'; claro?: boolean }) {
  return <ActivityIndicator size={size} color={claro ? '#FFFFFF' : color.primary} />
}

export function CargandoBloque({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <View style={est.bloque}>
      <LoaderBareca size={52} />
      <Text style={est.bloqueTexto}>{texto}</Text>
    </View>
  )
}

export function EstadoError({
  mensaje,
  onReintentar,
  compacto = false,
}: {
  mensaje: string
  onReintentar?: () => void
  compacto?: boolean
}) {
  return (
    <View style={[est.errorCaja, compacto && { padding: 14 }]}>
      <Text style={est.errorTitulo}>No se pudo cargar</Text>
      <Text style={est.errorMensaje}>{mensaje}</Text>
      {onReintentar && (
        <Pressable onPress={onReintentar} style={({ pressed }) => [est.reintentar, pressed && { opacity: 0.7 }]}>
          <Text style={est.reintentarTexto}>Reintentar</Text>
        </Pressable>
      )}
    </View>
  )
}

export function EstadoVacio({ titulo, detalle, accion }: { titulo: string; detalle?: string; accion?: ReactNode }) {
  return (
    <View style={est.vacio}>
      <Text style={est.vacioTitulo}>{titulo}</Text>
      {detalle ? <Text style={est.vacioDetalle}>{detalle}</Text> : null}
      {accion ? <View style={{ marginTop: 14 }}>{accion}</View> : null}
    </View>
  )
}

/** Bloque gris pulsante (skeleton). */
export function Skeleton({
  w = '100%',
  h = 12,
  r = 8,
  style,
}: {
  w?: DimensionValue
  h?: number
  r?: number
  style?: object
}) {
  const opacidad = useRef(new Animated.Value(0.55)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacidad, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacidad, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [opacidad])
  return (
    <Animated.View
      style={[{ width: w, height: h, borderRadius: r, backgroundColor: color.borderSoft, opacity: opacidad }, style]}
    />
  )
}

const est = StyleSheet.create({
  bloque: { padding: 28, alignItems: 'center', gap: 10 },
  bloqueTexto: { fontSize: 12.5, color: color.text2 },
  errorCaja: {
    backgroundColor: color.dangerBg,
    borderWidth: 1,
    borderColor: color.dangerBorder,
    borderRadius: radio.lg,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  errorTitulo: { fontSize: 13.5, fontWeight: '800', color: color.danger },
  errorMensaje: { fontSize: 12, color: color.text2, textAlign: 'center' },
  reintentar: {
    marginTop: 8,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.dangerBorder,
    borderRadius: radio.md,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  reintentarTexto: { fontSize: 12, fontWeight: '700', color: color.danger },
  vacio: { padding: 30, alignItems: 'center' },
  vacioTitulo: { fontSize: 13.5, fontWeight: '800', color: color.text },
  vacioDetalle: { fontSize: 12, color: color.text2, marginTop: 4, textAlign: 'center' },
})
