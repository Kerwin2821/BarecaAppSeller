/**
 * Tokens de diseño espejo de portal/src/index.css (:root) del portal Winspec.
 * La app y la web comparten paleta para que el vendedor reconozca la marca.
 */
export const color = {
  navy: '#1B2470',
  navyDark: '#111A50',
  navyLight: '#2A3AA0',
  navyTint: '#EEEFFE',
  navyTint2: '#DFE2FD',

  orange: '#F15B2A',
  orangeDark: '#D44F23',
  orangeLight: '#FEF0EA',
  orangeGhost: '#FFF7F4',

  text: '#374151',
  text2: '#64748B',
  text3: '#9CA3AF',

  bgApp: '#F0F1F8',
  bgCard: '#F4F6FB',
  white: '#FFFFFF',

  border: '#E5E7EB',
  borderSoft: '#E9EBF3',
  borderCard: '#F1F3F9',
  borderRow: '#F3F4FA',
  borderInput: '#CBD5E1',

  success: '#16A34A',
  successBg: '#DCFCE7',
  successDark: '#15803D',
  amber: '#D97706',
  amberBg: '#FEF3C7',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
} as const

export const radio = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  full: 9999,
} as const

/** Fuente monoespaciada por plataforma (equivalente al `.mono` del portal). */
import { Platform } from 'react-native'
export const fuenteMono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
