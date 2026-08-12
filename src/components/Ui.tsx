import { useState, type ReactNode } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { Spinner } from './Estados'
import { color, fuenteMono, radio, sombra } from '../lib/tema'

/** Tarjeta blanca con borde suave, equivalente al .card del portal. */
export function Tarjeta({ children, style, onLayout }: { children: ReactNode; style?: StyleProp<ViewStyle>; onLayout?: (e: any) => void }) {
  return <View style={[est.tarjeta, style]} onLayout={onLayout}>{children}</View>
}

type VarianteBoton = 'primary' | 'accent' | 'soft' | 'ghost' | 'peligro' | 'mini' | 'exito'

export function Boton({
  texto,
  onPress,
  variante = 'primary',
  disabled = false,
  cargando = false,
  style,
}: {
  texto: string
  onPress: () => void
  variante?: VarianteBoton
  disabled?: boolean
  cargando?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const esMini = variante === 'mini'
  const fondo: Record<VarianteBoton, ViewStyle> = {
    primary: { backgroundColor: color.primary },
    accent: { backgroundColor: color.accent },
    exito: { backgroundColor: color.success },
    soft: { backgroundColor: color.bgCard, borderWidth: 1, borderColor: color.border },
    ghost: { backgroundColor: 'transparent' },
    peligro: { backgroundColor: color.white, borderWidth: 1, borderColor: color.dangerBorder },
    mini: { backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  }
  const textoColor: Record<VarianteBoton, string> = {
    primary: '#FFFFFF',
    accent: '#FFFFFF',
    exito: '#FFFFFF',
    soft: color.text2,
    ghost: color.primary,
    peligro: color.danger,
    mini: color.text2,
  }
  const claro = variante === 'primary' || variante === 'accent' || variante === 'exito'
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || cargando}
      style={({ pressed }) => [
        est.boton,
        esMini && est.botonMini,
        fondo[variante],
        (disabled || cargando) && { opacity: 0.55 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {cargando ? <Spinner size={14} claro={claro} /> : null}
      <Text style={[est.botonTexto, esMini && { fontSize: 11 }, { color: textoColor[variante] }]}>
        {texto}
      </Text>
    </Pressable>
  )
}

export function Campo({
  etiqueta,
  error = false,
  mono = false,
  revelable = false,
  style,
  inputStyle,
  ...props
}: TextInputProps & { etiqueta?: string; error?: boolean; mono?: boolean; revelable?: boolean; inputStyle?: StyleProp<TextStyle> }) {
  const [oculto, setOculto] = useState(true)
  const secure = revelable ? oculto : props.secureTextEntry
  return (
    <View style={style as StyleProp<ViewStyle>}>
      {etiqueta ? <Text style={est.campoEtiqueta}>{etiqueta}</Text> : null}
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          placeholderTextColor={color.text4}
          {...props}
          secureTextEntry={secure}
          style={[
            est.campo,
            revelable && { paddingRight: 46 },
            mono && { fontFamily: fuenteMono, fontSize: 13 },
            error && { borderColor: color.danger },
            props.editable === false && { backgroundColor: color.bgCard, color: color.text2 },
            inputStyle,
          ]}
        />
        {revelable ? (
          <Pressable onPress={() => setOculto((v) => !v)} style={est.ojo} hitSlop={8}>
            <Text style={{ fontSize: 17 }}>{oculto ? '👁️' : '🙈'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

export function Alerta({ tipo, children }: { tipo: 'info' | 'error' | 'exito'; children: ReactNode }) {
  const estilos =
    tipo === 'error'
      ? { bg: color.dangerBg, bd: color.dangerBorder, fg: color.danger }
      : tipo === 'exito'
        ? { bg: color.successBg, bd: color.success, fg: color.success }
        : { bg: color.primaryLight, bd: color.primary, fg: color.primaryDark }
  return (
    <View style={[est.alerta, { backgroundColor: estilos.bg, borderColor: estilos.bd }]}>
      <Text style={{ fontSize: 12, lineHeight: 17.5, color: estilos.fg }}>{children}</Text>
    </View>
  )
}

export function Pildora({ texto, color: c }: { texto: string; color: string }) {
  return (
    <View style={[est.pildora, { backgroundColor: `${c}1A` }]}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: c }}>{texto}</Text>
    </View>
  )
}

export function Chip({
  texto,
  fondo = color.bgCard,
  colorTexto = color.text2,
}: {
  texto: string
  fondo?: string
  colorTexto?: string
}) {
  return (
    <View style={[est.pildora, { backgroundColor: fondo }]}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colorTexto }}>{texto}</Text>
    </View>
  )
}

export function Avatar({ texto, size = 32, invertido = false }: { texto: string; size?: number; invertido?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: invertido ? color.primary : color.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.34, fontWeight: '800', color: invertido ? '#FFFFFF' : color.primary }}>
        {texto}
      </Text>
    </View>
  )
}

export function TituloSeccion({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  return <Text style={[est.tituloSeccion, style as object]}>{children}</Text>
}

const est = StyleSheet.create({
  tarjeta: {
    backgroundColor: color.white,
    borderRadius: radio.lg,
    borderWidth: 1,
    borderColor: color.borderSoft,
    ...sombra.card,
  },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radio.md + 2,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  botonMini: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radio.md },
  botonTexto: { fontSize: 13, fontWeight: '700' },
  campoEtiqueta: { fontSize: 12, fontWeight: '700', color: color.text2, marginBottom: 6 },
  campo: {
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: radio.md + 2,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: 13.5,
    color: color.text,
    backgroundColor: color.white,
    fontFamily: 'Inter_400Regular',
  },
  ojo: { position: 'absolute', right: 8, padding: 6 },
  alerta: { borderWidth: 1, borderRadius: radio.md + 2, paddingVertical: 11, paddingHorizontal: 14 },
  pildora: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 99,
  },
  tituloSeccion: { fontSize: 13, fontWeight: '800', color: color.text, marginTop: 22, marginBottom: 10 },
})
