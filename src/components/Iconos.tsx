import Svg, { Circle, Path, Rect } from 'react-native-svg'

/** Iconos de las pestañas, trazados a mano para no sumar dependencias. */

export function IconoDashboard({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={8} height={8} rx={2} stroke={color} strokeWidth={1.8} />
      <Rect x={13} y={3} width={8} height={5} rx={2} stroke={color} strokeWidth={1.8} />
      <Rect x={13} y={10} width={8} height={11} rx={2} stroke={color} strokeWidth={1.8} />
      <Rect x={3} y={13} width={8} height={8} rx={2} stroke={color} strokeWidth={1.8} />
    </Svg>
  )
}

export function IconoMapa({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21s-6.5-5.4-6.5-10A6.5 6.5 0 0 1 12 4.5 6.5 6.5 0 0 1 18.5 11c0 4.6-6.5 10-6.5 10Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={11} r={2.4} stroke={color} strokeWidth={1.8} />
    </Svg>
  )
}

export function IconoUsuarios({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8.5} r={3.2} stroke={color} strokeWidth={1.8} />
      <Path d="M3.5 19c.8-3 2.9-4.5 5.5-4.5s4.7 1.5 5.5 4.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={16.5} cy={9.5} r={2.4} stroke={color} strokeWidth={1.6} />
      <Path d="M16.2 14.6c2.3.1 3.8 1.4 4.4 3.9" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  )
}

export function IconoPerfil({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.2} r={3.6} stroke={color} strokeWidth={1.8} />
      <Path d="M4.8 20c1-3.6 3.9-5.4 7.2-5.4s6.2 1.8 7.2 5.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  )
}
