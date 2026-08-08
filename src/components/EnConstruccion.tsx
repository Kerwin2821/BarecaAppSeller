import { StyleSheet, Text, View } from 'react-native'
import { Pantalla } from './Pantalla'
import { Tarjeta } from './Ui'
import { color } from '../lib/tema'

/**
 * Pantalla presente y navegable cuyo flujo completo (sobre todo emisión/pagos)
 * necesita una sesión real de QA para verificarse extremo a extremo. Deja claro
 * qué endpoint del BFF consume, para completar en cuanto haya credenciales.
 */
export function EnConstruccion({
  titulo,
  descripcion,
  endpoints,
}: {
  titulo: string
  descripcion: string
  endpoints?: string[]
}) {
  return (
    <Pantalla>
      <Tarjeta style={{ padding: 22 }}>
        <View style={est.badge}>
          <Text style={est.badgeTexto}>PENDIENTE DE VERIFICAR EN QA</Text>
        </View>
        <Text style={est.titulo}>{titulo}</Text>
        <Text style={est.desc}>{descripcion}</Text>
        {endpoints && endpoints.length > 0 ? (
          <View style={est.endpoints}>
            <Text style={est.endpointsTitulo}>Endpoints del BFF que consume:</Text>
            {endpoints.map((e) => (
              <Text key={e} style={est.endpoint}>
                • {e}
              </Text>
            ))}
          </View>
        ) : null}
      </Tarjeta>
    </Pantalla>
  )
}

const est = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: color.warningBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 99,
    marginBottom: 12,
  },
  badgeTexto: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, color: color.amber },
  titulo: { fontSize: 18, fontWeight: '800', color: color.text },
  desc: { fontSize: 13, color: color.text2, marginTop: 8, lineHeight: 20 },
  endpoints: { marginTop: 16, backgroundColor: color.bgCard, borderRadius: 10, padding: 12 },
  endpointsTitulo: { fontSize: 11, fontWeight: '700', color: color.text3, marginBottom: 6 },
  endpoint: { fontSize: 11.5, color: color.text2, lineHeight: 18 },
})
