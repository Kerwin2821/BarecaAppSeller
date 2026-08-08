/**
 * Tokens de diseño del portal de vendedores Bareca (asesores.barecaonline.com).
 * Paleta derivada de los estilos reales del portal: primario #147db1 (azul Bareca),
 * acento Material #1976d2, neutros tipo Bootstrap/Tailwind.
 */
import { Platform } from 'react-native'

export const color = {
  primary: '#147DB1',
  primaryDark: '#0F5F86',
  primaryLight: '#E6F2F8',
  primaryTint: '#F0F7FB',

  accent: '#1976D2',

  // Neutros
  text: '#212529',
  text2: '#495057',
  text3: '#6C757D',
  text4: '#94A3B8',

  bgApp: '#F4F6F9',
  bgCard: '#F8F9FA',
  white: '#FFFFFF',

  border: '#DEE2E6',
  borderSoft: '#E9ECEF',
  borderInput: '#CED4DA',

  success: '#198754',
  successBg: '#D1E7DD',
  warning: '#FD7E14',
  warningBg: '#FFF3CD',
  amber: '#B26A00',
  danger: '#DC3545',
  dangerBg: '#F8D7DA',
  dangerBorder: '#F5C2C7',

  // Estados de póliza
  vigente: '#198754',
  inactiva: '#6C757D',
  procesado: '#147DB1',
} as const

export const radio = { sm: 6, md: 10, lg: 14, xl: 20, full: 9999 } as const

export const sombra = {
  card: {
    shadowColor: '#0B2A3B',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
} as const

/** Fuente monoespaciada por plataforma. */
export const fuenteMono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
