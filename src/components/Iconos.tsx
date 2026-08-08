import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg'

/** Set de iconos de trazo para el menú y la navegación (sin dependencias). */
type P = { color: string; size?: number }
const sw = 1.8

export function IcoVenta({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={20} r={1.4} fill={color} />
      <Circle cx={18} cy={20} r={1.4} fill={color} />
      <Path d="M2.5 3h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.2L20 7H6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
export function IcoExpress({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
    </Svg>
  )
}
export function IcoPolizas({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 3h8l4 4v14a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0V3Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
      <Polyline points="13,3 13,8 18,8" stroke={color} strokeWidth={sw} strokeLinejoin="round" fill="none" />
      <Line x1={8.5} y1={12} x2={15.5} y2={12} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Line x1={8.5} y1={15.5} x2={15.5} y2={15.5} stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  )
}
export function IcoComisiones({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={sw} />
      <Path d="M15 8.5c-.6-1-1.7-1.6-3-1.6-1.9 0-3 1-3 2.3 0 3 6 1.5 6 4.6 0 1.4-1.3 2.4-3.2 2.4-1.4 0-2.6-.6-3.2-1.7M12 5.5v13" stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  )
}
export function IcoReporte({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={4} y1={20} x2={20} y2={20} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Rect x={5} y={11} width={3.4} height={7} rx={1} stroke={color} strokeWidth={sw} />
      <Rect x={10.3} y={6} width={3.4} height={12} rx={1} stroke={color} strokeWidth={sw} />
      <Rect x={15.6} y={9} width={3.4} height={9} rx={1} stroke={color} strokeWidth={sw} />
    </Svg>
  )
}
export function IcoMapa({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
      <Line x1={9} y1={4} x2={9} y2={18} stroke={color} strokeWidth={sw} />
      <Line x1={15} y1={6} x2={15} y2={20} stroke={color} strokeWidth={sw} />
    </Svg>
  )
}
export function IcoRachas({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3c1.5 3-1.5 4.5-1.5 7A3.5 3.5 0 0 0 14 13c0-1 .8-1.8.8-1.8.9 1 1.7 2.4 1.7 4.1A4.5 4.5 0 0 1 12 20a4.8 4.8 0 0 1-5-4.8C7 10.5 12 9 12 3Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
    </Svg>
  )
}
export function IcoEquipo({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8.5} r={3.2} stroke={color} strokeWidth={sw} />
      <Path d="M3.5 19c.8-3 2.9-4.5 5.5-4.5s4.7 1.5 5.5 4.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Circle cx={16.5} cy={9.5} r={2.4} stroke={color} strokeWidth={1.6} />
      <Path d="M16.2 14.6c2.3.1 3.8 1.4 4.4 3.9" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  )
}
export function IcoSoporte({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={sw} />
      <Path d="M9.2 9.3a2.8 2.8 0 0 1 5.4 1c0 1.9-2.6 2.3-2.6 3.7" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Circle cx={12} cy={17} r={1} fill={color} />
    </Svg>
  )
}
export function IcoChat({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 5h16v11H9l-4 3v-3H4V5Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
    </Svg>
  )
}
export function IcoAjustePagos({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={6} width={18} height={12} rx={2} stroke={color} strokeWidth={sw} />
      <Line x1={3} y1={10} x2={21} y2={10} stroke={color} strokeWidth={sw} />
      <Line x1={7} y1={14.5} x2={11} y2={14.5} stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  )
}
export function IcoSolicitudes({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 3h8l4 4v14H6V3Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M14.5 12.5 11 16l-2 .5.5-2 3.5-3.5a1 1 0 0 1 1.5 1.5Z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  )
}
export function IcoPerfil({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.2} r={3.6} stroke={color} strokeWidth={sw} />
      <Path d="M4.8 20c1-3.6 3.9-5.4 7.2-5.4s6.2 1.8 7.2 5.4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  )
}
export function IcoCampana({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M10 19a2 2 0 0 0 4 0" stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  )
}
export function IcoMenu({ color, size = 24 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={4} y1={7} x2={20} y2={7} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={4} y1={12} x2={20} y2={12} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={4} y1={17} x2={20} y2={17} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  )
}
export function IcoSalir({ color, size = 22 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Path d="M10 8 6 12l4 4M6 12h10" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
export function IcoAtras({ color, size = 24 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5 8 12l7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
