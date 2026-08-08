import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Modal as ModalRN,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { color, radio } from '../lib/tema'

/** Hoja modal con tarjeta centrada, equivalente al Modal del portal. */
export function Modal({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  children,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  subtitulo?: string
  children: ReactNode
}) {
  return (
    <ModalRN visible={abierto} transparent animationType="fade" onRequestClose={onCerrar}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={est.fondo}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCerrar} />
        <View style={est.tarjeta}>
          <View style={est.encabezado}>
            <View style={{ flex: 1 }}>
              <Text style={est.titulo}>{titulo}</Text>
              {subtitulo ? <Text style={est.subtitulo}>{subtitulo}</Text> : null}
            </View>
            <Pressable onPress={onCerrar} style={({ pressed }) => [est.cerrar, pressed && { opacity: 0.6 }]}>
              <Text style={{ fontSize: 15, color: color.text2 }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 20, paddingTop: 6 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </ModalRN>
  )
}

const est = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(27,36,112,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  tarjeta: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    backgroundColor: color.white,
    borderRadius: radio.xl,
    overflow: 'hidden',
    shadowColor: '#1B2470',
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 20,
    paddingBottom: 12,
  },
  titulo: { fontSize: 16.5, fontWeight: '800', color: color.text, letterSpacing: -0.2 },
  subtitulo: { fontSize: 11.5, color: color.text2, marginTop: 3 },
  cerrar: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
