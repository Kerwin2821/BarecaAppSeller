import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Animated, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, radio } from '../lib/tema'

type Tipo = 'ok' | 'error' | 'info'

interface ToastCtx {
  avisar: (mensaje: string, tipo?: Tipo) => void
}

const Ctx = createContext<ToastCtx | null>(null)

const FONDO: Record<Tipo, string> = {
  ok: color.success,
  error: color.danger,
  info: color.primary,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: Tipo } | null>(null)
  const anim = useRef(new Animated.Value(0)).current
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const insets = useSafeAreaInsets()

  const avisar = useCallback(
    (texto: string, tipo: Tipo = 'info') => {
      if (temporizador.current) clearTimeout(temporizador.current)
      setMensaje({ texto, tipo })
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start()
      temporizador.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
          setMensaje(null),
        )
      }, 3200)
    },
    [anim],
  )

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current)
    },
    [],
  )

  return (
    <Ctx.Provider value={{ avisar }}>
      {children}
      {mensaje && (
        <Animated.View
          pointerEvents="none"
          style={[
            est.toast,
            {
              backgroundColor: FONDO[mensaje.tipo],
              bottom: insets.bottom + 24,
              opacity: anim,
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
              ],
            },
          ]}
        >
          <Text style={est.texto}>{mensaje.texto}</Text>
        </Animated.View>
      )}
    </Ctx.Provider>
  )
}

export function useToast(): ToastCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return c
}

const est = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: radio.lg,
    paddingVertical: 13,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  texto: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
})
