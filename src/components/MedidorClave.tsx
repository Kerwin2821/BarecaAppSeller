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

/** Requisitos que se van marcando en vivo mientras el usuario escribe. */
const REQUISITOS: { ok: (s: string) => boolean; txt: string }[] = [
  { ok: (s) => s.length >= 8, txt: '8+ caracteres' },
  { ok: (s) => /[A-ZÁÉÍÓÚÑ]/.test(s), txt: 'Una mayúscula' },
  { ok: (s) => /\d/.test(s), txt: 'Un número' },
  { ok: (s) => /[^A-Za-z0-9]/.test(s), txt: 'Un carácter especial' },
]

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
      <View style={est.reqLista}>
        {REQUISITOS.map((r, i) => {
          const ok = r.ok(clave)
          return (
            <View key={i} style={est.reqItem}>
              <Text style={[est.reqIcon, { color: ok ? color.success : color.text4 }]}>{ok ? '✓' : '○'}</Text>
              <Text style={[est.reqTxt, ok && { color: color.success, fontWeight: '700' }]}>{r.txt}</Text>
            </View>
          )
        })}
      </View>
    </>
  )
}

const est = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  barraFondo: { flex: 1, height: 5, backgroundColor: '#E2E8F0', borderRadius: 99, overflow: 'hidden' },
  barra: { height: '100%', borderRadius: 99 },
  etiqueta: { fontSize: 11, fontWeight: '700', minWidth: 62, textAlign: 'right' },
  reqLista: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, rowGap: 6 },
  reqItem: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '50%' },
  reqIcon: { fontSize: 13, fontWeight: '800', width: 14 },
  reqTxt: { fontSize: 11.5, color: color.text3 },
})
