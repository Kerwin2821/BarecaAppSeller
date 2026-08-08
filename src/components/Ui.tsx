import type { ReactNode } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { Spinner } from './Estados'
import { color, fuenteMono, radio } from '../lib/tema'

/** Tarjeta blanca con borde suave, equivalente al .card del portal. */
export function Tarjeta({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[est.tarjeta, style]}>{children}</View>
}

type VarianteBoton = 'orange' | 'navy' | 'soft' | 'ghost' | 'peligro' | 'mini' | 'miniSoft'

export function Boton({
  texto,
  onPress,
  variante = 'orange',
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
  const esMini = variante === 'mini' || variante === 'miniSoft'
  const fondo: Record<VarianteBoton, ViewStyle> = {
    orange: { backgroundColor: color.orange },
    navy: { backgroundColor: color.navy },
    soft: { backgroundColor: color.bgCard, borderWidth: 1, borderColor: color.borderSoft },
    ghost: { backgroundColor: 'transparent' },
    peligro: { backgroundColor: color.white, borderWidth: 1, borderColor: color.dangerBorder },
    mini: { backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
    miniSoft: { backgroundColor: color.navyTint },
  }
  const textoColor: Record<VarianteBoton, string> = {
    orange: '#FFFFFF',
    navy: '#FFFFFF',
    soft: color.text2,
    ghost: color.navy,
    peligro: color.danger,
    mini: color.text2,
    miniSoft: color.navy,
  }
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
      {cargando ? <Spinner size={14} claro={variante === 'orange' || variante === 'navy'} /> : null}
      <Text style={[est.botonTexto, esMini && { fontSize: 11 }, { color: textoColor[variante] }]}>
        {texto}
      </Text>
    </Pressable>
  )
}

/** Etiqueta + campo de texto, equivalente al .field-label + .input del portal. */
export function Campo({
  etiqueta,
  error = false,
  mono = false,
  style,
  ...props
}: TextInputProps & { etiqueta?: string; error?: boolean; mono?: boolean }) {
  return (
    <View style={style as StyleProp<ViewStyle>}>
      {etiqueta ? <Text style={est.campoEtiqueta}>{etiqueta}</Text> : null}
      <TextInput
        placeholderTextColor={color.text3}
        {...props}
        style={[
          est.campo,
          mono && { fontFamily: fuenteMono, fontSize: 13 },
          error && { borderColor: color.danger },
          props.editable === false && { backgroundColor: color.bgCard, color: color.text2 },
        ]}
      />
    </View>
  )
}

export function Alerta({ tipo, children }: { tipo: 'info' | 'error'; children: ReactNode }) {
  const esError = tipo === 'error'
  return (
    <View
      style={[
        est.alerta,
        esError
          ? { backgroundColor: color.dangerBg, borderColor: color.dangerBorder }
          : { backgroundColor: color.navyTint, borderColor: color.navyTint2 },
      ]}
    >
      <Text style={{ fontSize: 12, lineHeight: 17.5, color: esError ? color.danger : color.navy }}>
        {children}
      </Text>
    </View>
  )
}

/** Píldora tintada con el color del criterio (estiloPildora del portal). */
export function Pildora({ texto, color: c }: { texto: string; color: string }) {
  return (
    <View style={[est.pildora, { backgroundColor: `${c}14` }]}>
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

export function Avatar({
  texto,
  size = 30,
  invertido = false,
}: {
  texto: string
  size?: number
  invertido?: boolean
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: invertido ? color.navy : color.navyTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: size * 0.34,
          fontWeight: '800',
          color: invertido ? '#FFFFFF' : color.navy,
        }}
      >
        {texto}
      </Text>
    </View>
  )
}

/** Título de sección dentro del expediente / pantallas. */
export function TituloSeccion({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  return <Text style={[est.tituloSeccion, style as object]}>{children}</Text>
}

const est = StyleSheet.create({
  tarjeta: {
    backgroundColor: color.white,
    borderRadius: radio.lg,
    borderWidth: 1,
    borderColor: color.borderCard,
    shadowColor: '#101336',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
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
  campoEtiqueta: {
    fontSize: 12,
    fontWeight: '700',
    color: color.text,
    marginBottom: 6,
  },
  campo: {
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: radio.md + 2,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: 13.5,
    color: color.text,
    backgroundColor: color.white,
  },
  alerta: {
    borderWidth: 1,
    borderRadius: radio.md + 2,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  pildora: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 99,
  },
  tituloSeccion: {
    fontSize: 13,
    fontWeight: '800',
    color: color.navy,
    marginTop: 24,
    marginBottom: 10,
  },
})
