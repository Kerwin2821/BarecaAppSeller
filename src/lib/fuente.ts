import React from 'react'
import { StyleSheet, Text } from 'react-native'

/**
 * Aplica las tipografías del **Manual de Marca** a TODO el texto del app:
 *   · Hanken Grotesk → texto e interfaz (pesos 400/500/600/700)
 *   · Plus Jakarta Sans → titulares/display (pesos 800/900)
 *
 * Como en RN cada peso es una familia distinta, mapeamos el `fontWeight` del
 * estilo a la variante correspondiente. Los textos con `fontFamily` propia (p.ej.
 * la monoespaciada) se respetan. (El logotipo va en Futura Bold como archivo de
 * imagen, no como fuente — no se toca aquí.)
 */
const PESO: Record<string, string> = {
  '100': 'HankenGrotesk_400Regular',
  '200': 'HankenGrotesk_400Regular',
  '300': 'HankenGrotesk_400Regular',
  '400': 'HankenGrotesk_400Regular',
  normal: 'HankenGrotesk_400Regular',
  '500': 'HankenGrotesk_500Medium',
  '600': 'HankenGrotesk_600SemiBold',
  '700': 'HankenGrotesk_700Bold',
  bold: 'HankenGrotesk_700Bold',
  '800': 'PlusJakartaSans_800ExtraBold',
  '900': 'PlusJakartaSans_800ExtraBold',
}

function familiaMarca(style: any): string | undefined {
  const flat: any = StyleSheet.flatten(style) || {}
  if (flat.fontFamily) return undefined // respeta fuentes explícitas
  const w = flat.fontWeight != null ? String(flat.fontWeight) : '400'
  return PESO[w] ?? 'HankenGrotesk_400Regular'
}

let aplicado = false

/** Parchea `Text.render` una sola vez para inyectar la tipografía de marca según el peso. */
export function aplicarFuentesMarca(): void {
  if (aplicado) return
  aplicado = true
  const T: any = Text
  const orig = T.render
  if (typeof orig !== 'function') return
  T.render = function (this: any, ...args: any[]) {
    const el = orig.apply(this, args)
    const fam = familiaMarca(el?.props?.style)
    if (!fam) return el
    return React.cloneElement(el, {
      style: [{ fontFamily: fam }, el.props.style, { fontWeight: 'normal' }],
    })
  }
}
