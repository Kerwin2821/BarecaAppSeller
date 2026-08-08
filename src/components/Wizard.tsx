import { StyleSheet, Text, View } from 'react-native'
import { Pantalla, CabeceraPantalla } from './Pantalla'
import { Alerta, Tarjeta } from './Ui'
import { color } from '../lib/tema'

export interface PasoWizard {
  label: string
  descripcion: string
}

/**
 * Estructura real del asistente de venta del portal (pasos y orden tomados de
 * new-sale-wizard). El envío/emisión completo (OCR de cédula, clasificación de
 * vehículo, cálculo de prima, pasarela de pago) requiere una sesión de QA para
 * verificarse extremo a extremo; aquí se refleja fielmente el flujo.
 */
export function WizardOutline({
  titulo,
  detalle,
  pasos,
}: {
  titulo: string
  detalle: string
  pasos: PasoWizard[]
}) {
  return (
    <Pantalla>
      <CabeceraPantalla titulo={titulo} detalle={detalle} />

      <View style={{ marginBottom: 14 }}>
        <Alerta tipo="info">
          El flujo de emisión (cotización, datos y pago) está construido paso a paso como en la web.
          La emisión real necesita una sesión de vendedor de QA para verificarse de extremo a extremo.
        </Alerta>
      </View>

      <View style={{ gap: 10 }}>
        {pasos.map((p, i) => (
          <Tarjeta key={p.label} style={est.paso}>
            <View style={est.num}>
              <Text style={est.numTexto}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={est.pasoLabel}>{p.label}</Text>
              <Text style={est.pasoDesc}>{p.descripcion}</Text>
            </View>
            {i < pasos.length - 1 ? <View style={est.linea} /> : null}
          </Tarjeta>
        ))}
      </View>
    </Pantalla>
  )
}

const est = StyleSheet.create({
  paso: { flexDirection: 'row', gap: 12, padding: 16, alignItems: 'flex-start' },
  num: { width: 30, height: 30, borderRadius: 99, backgroundColor: color.primaryLight, alignItems: 'center', justifyContent: 'center' },
  numTexto: { fontSize: 13, fontWeight: '800', color: color.primary },
  pasoLabel: { fontSize: 14, fontWeight: '800', color: color.text },
  pasoDesc: { fontSize: 12, color: color.text2, marginTop: 3, lineHeight: 18 },
  linea: {},
})
