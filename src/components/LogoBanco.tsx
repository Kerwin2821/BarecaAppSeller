import { Image, StyleSheet, Text, View } from 'react-native'
import { bancoInfo } from '../lib/bancos'

/**
 * Logos REALES de los bancos: PNG en `assets/bancos/<codigo>.png`. `require` debe
 * ser estático (una línea por banco), y el archivo debe existir en el bundle. A
 * medida que se agreguen los PNG, se descomenta/añade su línea aquí. Si un banco
 * no tiene imagen, se usa la insignia con color de marca + siglas como respaldo.
 */
const LOGOS: Record<string, number> = {
  '0102': require('../../assets/bancos/0102.png'), // Banco de Venezuela
  '0104': require('../../assets/bancos/0104.png'), // Venezolano de Crédito
  '0105': require('../../assets/bancos/0105.png'), // Mercantil
  '0108': require('../../assets/bancos/0108.png'), // BBVA Provincial
  '0114': require('../../assets/bancos/0114.png'), // Bancaribe
  '0115': require('../../assets/bancos/0115.png'), // Exterior
  '0128': require('../../assets/bancos/0128.png'), // Caroní
  '0134': require('../../assets/bancos/0134.png'), // Banesco
  '0137': require('../../assets/bancos/0137.png'), // Sofitasa
  '0138': require('../../assets/bancos/0138.png'), // Banco Plaza
  '0146': require('../../assets/bancos/0146.png'), // Bangente
  '0151': require('../../assets/bancos/0151.png'), // BFC Banco Fondo Común
  '0156': require('../../assets/bancos/0156.png'), // 100% Banco
  '0157': require('../../assets/bancos/0157.png'), // DelSur
  '0163': require('../../assets/bancos/0163.png'), // Banco del Tesoro
  '0166': require('../../assets/bancos/0166.png'), // Banco Agrícola de Venezuela
  '0168': require('../../assets/bancos/0168.png'), // Bancrecer
  '0169': require('../../assets/bancos/0169.png'), // Mi Banco (R4)
  '0171': require('../../assets/bancos/0171.png'), // Banco Activo
  '0172': require('../../assets/bancos/0172.png'), // Bancamiga
  '0173': require('../../assets/bancos/0173.png'), // Banco Internacional de Desarrollo (BID)
  '0174': require('../../assets/bancos/0174.png'), // Banplus
  '0175': require('../../assets/bancos/0175.png'), // Banco Bicentenario (BDT)
  '0177': require('../../assets/bancos/0177.png'), // BANFANB
  '0178': require('../../assets/bancos/0178.png'), // N58 Banco Digital
  '0191': require('../../assets/bancos/0191.png'), // BNC
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
