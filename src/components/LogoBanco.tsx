import { Image, StyleSheet, Text, View } from 'react-native'
import { bancoInfo } from '../lib/bancos'

/**
 * Logos REALES de los bancos: PNG en `assets/bancos/<codigo>.png`. `require` debe
 * ser estático (una línea por banco), y el archivo debe existir en el bundle. A
 * medida que se agreguen los PNG, se descomenta/añade su línea aquí. Si un banco
 * no tiene imagen, se usa la insignia con color de marca + siglas como respaldo.
 */
const LOGOS: Record<string, number> = {
  // Ejemplo (descomentar cuando el archivo exista):
  // '0102': require('../../assets/bancos/0102.png'),
  // '0105': require('../../assets/bancos/0105.png'),
}

export function LogoBanco({
  codigo,
  nombre,
  size = 40,
}: {
  codigo?: string | null
  nombre?: string | null
  size?: number
}) {
  const cod = String(codigo ?? '').padStart(4, '0')
  const img = LOGOS[cod]
  const radio = Math.round(size / 4)

  if (img) {
    return (
      <View style={[est.imgChip, { width: size, height: size, borderRadius: radio }]}>
        <Image source={img} resizeMode="contain" style={{ width: size * 0.82, height: size * 0.82 }} />
      </View>
    )
  }

  const b = bancoInfo(codigo, nombre)
  return (
    <View style={[est.chip, { width: size, height: size, borderRadius: radio, backgroundColor: b.color }]}>
      <Text style={[est.sigla, { fontSize: Math.max(9, size * 0.3) }]} numberOfLines={1}>
        {b.sigla}
      </Text>
    </View>
  )
}

const est = StyleSheet.create({
  chip: { alignItems: 'center', justifyContent: 'center' },
  sigla: { color: '#fff', fontWeight: '900', letterSpacing: 0.3 },
  imgChip: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
})
