import { useCallback, useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/lib/auth'
import { leerMensajes, enviarMensaje, type MensajeChat } from '@/lib/chatFirestore'
import { Spinner } from '@/components/Estados'
import { color } from '@/lib/tema'

/**
 * Hilo de un ticket de soporte. Lee/escribe en Firestore (chats/ticket_<id>/
 * messages) vía REST y sondea cada 4 s para traer mensajes nuevos, replicando
 * el chat en tiempo real del portal.
 */
export default function ChatHilo() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user } = useAuth()
  const params = useLocalSearchParams<{ id: string; asunto?: string }>()
  const ticketId = String(params.id ?? '')
  const convId = `ticket_${ticketId}`
  const yo = user?.loginId ?? 'yo'
  const miNombre = user?.firstName || 'Yo'

  const [mensajes, setMensajes] = useState<MensajeChat[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  const refrescar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true)
      try {
        const m = await leerMensajes(convId)
        setMensajes(m)
        setError(null)
      } catch (e) {
        if (!silencioso) setError((e as Error)?.message ?? 'No se pudo cargar el chat.')
      } finally {
        if (!silencioso) setCargando(false)
      }
    },
    [convId],
  )

  // Carga inicial + sondeo cada 4 s.
  useEffect(() => {
    void refrescar()
    const t = setInterval(() => void refrescar(true), 4000)
    return () => clearInterval(t)
  }, [refrescar])

  // Auto-scroll al final cuando llegan mensajes.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(t)
  }, [mensajes.length])

  const enviar = useCallback(async () => {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    // Optimista: muestra el mensaje ya.
    const optimista: MensajeChat = { id: `tmp-${Date.now()}`, from: yo, fromNombre: miNombre, text: t, ts: Date.now() }
    setMensajes((prev) => [...prev, optimista])
    setTexto('')
    try {
      await enviarMensaje(convId, yo, miNombre, t)
      await refrescar(true)
    } catch (e) {
      setError((e as Error)?.message ?? 'No se pudo enviar el mensaje.')
    } finally {
      setEnviando(false)
    }
  }, [texto, enviando, yo, miNombre, convId, refrescar])

  return (
    <View style={{ flex: 1, backgroundColor: color.bgApp }}>
      {/* Cabecera */}
      <View style={[est.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={est.back}>
          <Text style={{ fontSize: 22, color: color.text }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={est.htitulo} numberOfLines={1}>
            {params.asunto || 'Conversación'}
          </Text>
          <Text style={est.hsub}>Ticket #{ticketId}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {cargando ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Spinner />
            </View>
          ) : error ? (
            <View style={est.avisoErr}>
              <Text style={{ color: color.danger, fontSize: 12.5 }}>{error}</Text>
            </View>
          ) : mensajes.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 34, marginBottom: 8 }}>💬</Text>
              <Text style={{ fontSize: 13, color: color.text3, textAlign: 'center' }}>
                Aún no hay mensajes. Escribe el primero para iniciar la conversación con soporte.
              </Text>
            </View>
          ) : (
            mensajes.map((m) => {
              const mio = m.from === yo
              return (
                <View key={m.id} style={[est.fila, { justifyContent: mio ? 'flex-end' : 'flex-start' }]}>
                  <View style={[est.burbuja, mio ? est.burbujaMia : est.burbujaOtro]}>
                    {!mio ? <Text style={est.autor}>{m.fromNombre || 'Soporte'}</Text> : null}
                    <Text style={[est.texto, mio && { color: '#fff' }]}>{m.text}</Text>
                  </View>
                </View>
              )
            })
          )}
        </ScrollView>

        {/* Barra de envío */}
        <View style={[est.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Escribe un mensaje…"
            placeholderTextColor={color.text4}
            style={est.input}
            multiline
            onSubmitEditing={enviar}
          />
          <Pressable onPress={enviar} disabled={!texto.trim() || enviando} style={[est.enviar, (!texto.trim() || enviando) && { opacity: 0.5 }]}>
            {enviando ? <Spinner size={16} claro /> : <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>➤</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const est = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: color.white,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
  },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  htitulo: { fontSize: 15, fontWeight: '800', color: color.text },
  hsub: { fontSize: 11, color: color.text3, marginTop: 1 },
  fila: { flexDirection: 'row' },
  burbuja: { maxWidth: '82%', borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12 },
  burbujaMia: { backgroundColor: color.primary, borderBottomRightRadius: 4 },
  burbujaOtro: { backgroundColor: color.white, borderWidth: 1, borderColor: color.borderSoft, borderBottomLeftRadius: 4 },
  autor: { fontSize: 10.5, fontWeight: '800', color: color.primary, marginBottom: 2 },
  texto: { fontSize: 13.5, color: color.text, lineHeight: 19 },
  avisoErr: { backgroundColor: color.dangerBg ?? '#FEECEC', borderRadius: 10, padding: 12 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: color.white,
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: color.text,
    backgroundColor: color.bgApp,
  },
  enviar: { width: 42, height: 42, borderRadius: 12, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
})
