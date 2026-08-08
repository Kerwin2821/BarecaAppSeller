import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../lib/auth'
import { iniciales, reloj } from '../lib/formato'
import { color, fuenteMono } from '../lib/tema'
import { usePortal } from './PortalContexto'
import { Avatar } from './Ui'

/**
 * Encabezado de las pestañas: título + subtítulo, píldora "en vivo",
 * reloj de sesión y avatar (equivale al header + tarjeta de sesión del portal).
 */
export function Encabezado({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  const insets = useSafeAreaInsets()
  const { admin, restantes } = useAuth()
  const { dashboard } = usePortal()

  const colorReloj = restantes < 60 ? color.danger : restantes < 180 ? color.amber : color.navy

  return (
    <View style={[est.contenedor, { paddingTop: insets.top + 10 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={est.titulo} numberOfLines={1}>
          {titulo}
        </Text>
        <Text style={est.subtitulo} numberOfLines={1}>
          {subtitulo}
        </Text>
      </View>

      <View style={est.vivo}>
        <View style={est.vivoPunto} />
        <Text style={est.vivoTexto}>{dashboard ? `${dashboard.enVivo} en vivo` : '— en vivo'}</Text>
      </View>

      <View style={est.sesion}>
        <Text style={[est.sesionTexto, { color: colorReloj }]}>{reloj(restantes)}</Text>
      </View>

      <Avatar texto={iniciales(admin?.nombre)} size={30} invertido />
    </View>
  )
}

const est = StyleSheet.create({
  contenedor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingBottom: 11,
    backgroundColor: color.white,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
  },
  titulo: { fontSize: 16, fontWeight: '800', color: color.navy, letterSpacing: -0.2 },
  subtitulo: { fontSize: 10.5, color: color.text3, marginTop: 1 },
  vivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 99,
  },
  vivoPunto: { width: 7, height: 7, borderRadius: 99, backgroundColor: color.success },
  vivoTexto: { fontSize: 10.5, fontWeight: '700', color: '#166534' },
  sesion: {
    backgroundColor: color.bgCard,
    borderWidth: 1,
    borderColor: color.borderSoft,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 99,
  },
  sesionTexto: { fontSize: 11.5, fontWeight: '700', fontFamily: fuenteMono },
})
