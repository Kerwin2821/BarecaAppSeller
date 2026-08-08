import { StyleSheet, Text, View } from 'react-native'
import { color } from '../lib/tema'

const COLORES = ['#E2E8F0', '#DC2626', '#D97706', '#16A34A', '#15803D']
const ETIQUETAS = ['—', 'Débil', 'Media', 'Fuerte', 'Excelente']

/** Fuerza 0–4: longitud, mayúscula, número, símbolo (+1 si 12 o más). */
export function fuerzaClave(clave: string): number {
  if (!clave) return 0
  const cumple = [
    clave.length >= 8,
    /[A-ZÁÉÍÓÚÑ]/.test(clave),
    /\d/.test(clave),
    /[^A-Za-z0-9]/.test(clave),
  ].filter(Boolean).length
  return Math.min(4, cumple + (clave.length >= 12 ? 1 : 0))
}

export function MedidorClave({ clave }: { clave: string }) {
  const f = fuerzaClave(clave)
  return (
    <>
      <View style={est.fila}>
        <View style={est.barraFondo}>
          <View style={[est.barra, { width: `${(f / 4) * 100}%`, backgroundColor: COLORES[f] }]} />
        </View>
        <Text style={[est.etiqueta, { color: f ? COLORES[f] : color.text3 }]}>{ETIQUETAS[f]}</Text>
      </View>
      <Text style={est.requisitos}>Requisitos: 8+ caracteres · mayúscula · número · símbolo</Text>
    </>
  )
}

const est = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  barraFondo: { flex: 1, height: 5, backgroundColor: '#E2E8F0', borderRadius: 99, overflow: 'hidden' },
  barra: { height: '100%', borderRadius: 99 },
  etiqueta: { fontSize: 11, fontWeight: '700', minWidth: 62, textAlign: 'right' },
  requisitos: { fontSize: 11, color: color.text3, marginTop: 10, lineHeight: 17 },
})
