/**
 * Tokens de diseño de la app Bareca. Paleta y radios alineados al **Manual de Marca
 * v2.0** (julio 2026): Azul Bareca como color institucional y Naranja Bareca como
 * único acento/llamado a la acción (≤10 % de la superficie). Cambiar estos valores
 * renueva el look de toda la app: los componentes referencian los tokens.
 */
import { Platform } from 'react-native'

export const color = {
  // Marca — Azul Bareca (primario) + Naranja Bareca (acento). Valores del manual.
  primary: '#15205C', // Azul Bareca — fondos, titulares, base institucional
  primaryDark: '#0E1640', // Azul profundo
  primaryLight: '#EAEEFB', // Azul suave
  primaryTint: '#F4F6FB', // Fondo (tinte claro)

  accent: '#F95428', // Naranja Bareca — botones, acentos, enlaces y CTA
  accentDark: '#E8451C', // Naranja hover / pressed

  // Neutros del manual
  text: '#15205C', // titulares / texto principal (Azul Bareca)
  text2: '#5C6588', // Texto secundario
  text3: '#717896', // Texto terciario
  text4: '#9AA1B9', // texto tenue / placeholders (derivado, más claro que el terciario)

  bgApp: '#F4F6FB', // Fondo
  bgCard: '#FFFFFF',
  white: '#FFFFFF',

  border: '#E4E7F1', // Borde
  borderSoft: '#E7EAF6', // Icono / borde suave
  borderInput: '#D6DBEA', // borde de campos (derivado del borde)

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
  inactiva: '#717896',
  procesado: '#15205C',
} as const

// Radios del manual: botones/campos 12 · tarjetas 20.
export const radio = { sm: 8, md: 12, lg: 16, xl: 20, full: 9999 } as const

// Sombra de tarjeta ≈ manual (0 18px 36px -20px rgba(21,32,92,.22)); RN no tiene
// spread, así que se aproxima con un desenfoque suave del mismo azul.
export const sombra = {
  card: {
    shadowColor: '#15205C',
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
} as const

/** Fuente monoespaciada por plataforma. */
export const fuenteMono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
