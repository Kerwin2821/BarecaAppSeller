import { Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { publicApi } from '@/lib/endpoints'
import { Boton, Tarjeta } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

/**
 * Verificación pública de póliza (sin sesión): destino del QR impreso en el
 * cuadro y el carnet. Abre el documento público servido por el BFF.
 */
export default function Verificar() {
  const insets = useSafeAreaInsets()
  const { policyNumber } = useLocalSearchParams<{ policyNumber: string }>()
  const num = String(policyNumber ?? '')

  const abrir = () => {
    if (num) Linking.openURL(publicApi.urlDocumento(num))
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bgApp }}
      contentContainerStyle={{ paddingTop: insets.top + 40, paddingHorizontal: 22, paddingBottom: 40 }}
    >
      <Image source={require('../../assets/logo-bareca.png')} style={est.logo} />
      <Tarjeta style={{ padding: 22, alignItems: 'center' }}>
        <View style={est.escudo}>
          <Text style={{ fontSize: 22 }}>🛡️</Text>
        </View>
        <Text style={est.titulo}>Verificación de Póliza</Text>
        <Text style={est.num}>{num || '—'}</Text>
        <Text style={est.desc}>
          Esta página confirma la autenticidad de la póliza y da acceso a su cuadro y carnet oficiales
          emitidos por Bareca.
        </Text>
        <Boton texto="Ver documento oficial" onPress={abrir} style={{ marginTop: 18, alignSelf: 'stretch' }} />
      </Tarjeta>
      <Text style={est.pie}>© {new Date().getFullYear()} Bareca C.A. · Corretaje de Seguros</Text>
    </ScrollView>
  )
}

const est = StyleSheet.create({
  logo: { width: 200, height: 64, resizeMode: 'contain', alignSelf: 'center', marginBottom: 22 },
  escudo: {
    width: 56,
    height: 56,
    borderRadius: 99,
    backgroundColor: color.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  titulo: { fontSize: 17, fontWeight: '800', color: color.text },
  num: { fontSize: 20, fontWeight: '800', color: color.primary, marginTop: 6, fontFamily: fuenteMono },
  desc: { fontSize: 12.5, color: color.text2, marginTop: 12, textAlign: 'center', lineHeight: 19 },
  pie: { marginTop: 26, fontSize: 11, color: color.text4, textAlign: 'center' },
})
