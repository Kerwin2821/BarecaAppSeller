import { StyleSheet, Text, View } from 'react-native'
import { bancoInfo } from '../lib/bancos'

/**
 * Insignia del banco (color de marca + siglas). Es una representación propia,
 * no el logotipo oficial. `codigo` es el código SUDEBAN (ej. "0105").
 */
export function LogoBanco({
  codigo,
  nombre,
  size = 40,
}: {
  codigo?: string | null
  nombre?: string | null
  size?: number
}) {
  const b = bancoInfo(codigo, nombre)
  return (
    <View
      style={[
        est.chip,
        { width: size, height: size, borderRadius: Math.round(size / 4), backgroundColor: b.color },
      ]}
    >
      <Text style={[est.sigla, { fontSize: Math.max(9, size * 0.3) }]} numberOfLines={1}>
        {b.sigla}
      </Text>
    </View>
  )
}

const est = StyleSheet.create({
  chip: { alignItems: 'center', justifyContent: 'center' },
  sigla: { color: '#fff', fontWeight: '900', letterSpacing: 0.3 },
})
