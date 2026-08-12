import React from 'react'
import { StyleSheet, Text } from 'react-native'

/**
 * Aplica la tipografía **Inter** a TODO el texto del app. Como en RN cada peso
 * es una familia distinta, mapeamos el `fontWeight` del estilo a la variante
 * Inter correspondiente (así las negritas/semibold se ven bien). Los textos con
 * `fontFamily` propia (p.ej. la monoespaciada) se respetan.
 */
const PESO: Record<string, string> = {
  '100': 'Inter_100Thin',
  '200': 'Inter_200ExtraLight',
  '300': 'Inter_300Light',
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
  '900': 'Inter_900Black',
}

function familiaInter(style: any): string | undefined {
  const flat: any = StyleSheet.flatten(style) || {}
  if (flat.fontFamily) return undefined // respeta fuentes explícitas
  const w = flat.fontWeight != null ? String(flat.fontWeight) : '400'
  return PESO[w] ?? 'Inter_400Regular'
}

let aplicado = false

/** Parchea `Text.render` una sola vez para inyectar Inter según el peso. */
export function aplicarFuenteInter(): void {
  if (aplicado) return
  aplicado = true
  const T: any = Text
  const orig = T.render
  if (typeof orig !== 'function') return
  T.render = function (this: any, ...args: any[]) {
    const el = orig.apply(this, args)
    const fam = familiaInter(el?.props?.style)
    if (!fam) return el
    return React.cloneElement(el, {
      style: [{ fontFamily: fam }, el.props.style, { fontWeight: 'normal' }],
    })
  }
}
