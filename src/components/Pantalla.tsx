import type { ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color } from '../lib/tema'

/** Contenedor estándar de pantalla con scroll y pull-to-refresh opcional. */
export function Pantalla({
  children,
  onRefresh,
  refrescando = false,
  sinScroll = false,
}: {
  children: ReactNode
  onRefresh?: () => void
  refrescando?: boolean
  sinScroll?: boolean
}) {
  const insets = useSafeAreaInsets()
  if (sinScroll) {
    return <View style={{ flex: 1, backgroundColor: color.bgApp }}>{children}</View>
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bgApp }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 28 }}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={color.primary} /> : undefined
      }
    >
      {children}
    </ScrollView>
  )
}

/** Encabezado de sección dentro de una pantalla. */
export function CabeceraPantalla({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={est.titulo}>{titulo}</Text>
      {detalle ? <Text style={est.detalle}>{detalle}</Text> : null}
    </View>
  )
}

const est = StyleSheet.create({
  titulo: { fontSize: 18, fontWeight: '800', color: color.text, letterSpacing: -0.3 },
  detalle: { fontSize: 12.5, color: color.text2, marginTop: 3, lineHeight: 18 },
})
