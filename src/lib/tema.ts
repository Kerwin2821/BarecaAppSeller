/**
 * Tokens de diseño de la app Bareca. Paleta alineada a la marca (logo): azul
 * marino (wordmark) como color primario y naranja como acento. Cambiar estos
 * valores renueva el look de toda la app: los componentes referencian los tokens.
 */
import { Platform } from 'react-native'

export const color = {
  // Marca — azul marino (primario) + naranja (acento)
  primary: '#2A2F6B',
  primaryDark: '#1C2150',
  primaryLight: '#EAECF7',
  primaryTint: '#F4F5FC',

  accent: '#F1592A',

  // Neutros (fríos, con leve tinte navy para que "peguen" con la marca)
  text: '#1A1E33',
  text2: '#474D63',
  text3: '#787E95',
  text4: '#A7ACBE',

  bgApp: '#F5F6FA',
  bgCard: '#F6F8FC',
  white: '#FFFFFF',

  border: '#E3E6F0',
  borderSoft: '#EDEFF6',
  borderInput: '#D3D8E6',

  success: '#12A06A',
  successBg: '#DDF3EB',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  amber: '#B26A00',
  danger: '#E5484D',
  dangerBg: '#FCE9EA',
  dangerBorder: '#F5C7C9',

  // Estados de póliza
  vigente: '#12A06A',
  inactiva: '#787E95',
  procesado: '#2A2F6B',
} as const

export const radio = { sm: 8, md: 11, lg: 16, xl: 22, full: 9999 } as const

export const sombra = {
  card: {
    shadowColor: '#1C2150',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
} as const

/** Fuente monoespaciada por plataforma. */
export const fuenteMono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
