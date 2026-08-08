import { useMemo, useState } from 'react'
import { Pressable, Text as TextoRN, View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Line, Path, Rect, Stop, Text as TextoSvg } from 'react-native-svg'
import { numero } from '../lib/formato'
import { color, fuenteMono } from '../lib/tema'

/* ══════════════════════════════════════════════════════════
   Gráficos espejo de portal/src/components/Charts.tsx,
   dibujados con react-native-svg (sin librerías de charts)
   ══════════════════════════════════════════════════════════ */

export interface PuntoSerie {
  etiqueta: string
  valor: number
}

/** Anillo de progreso: aro de fondo + arco de color con el valor al centro. */
export function AnilloProgreso({
  valor,
  max = 100,
  size = 52,
  grosor = 7,
  color: colorArco,
  texto,
  tamTexto,
}: {
  valor: number
  max?: number
  size?: number
  grosor?: number
  color: string
  texto?: string
  tamTexto?: number
}) {
  const r = (size - grosor) / 2
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, max === 0 ? 0 : valor / max))
  const fuente = tamTexto ?? Math.max(9, Math.round(size / 5))

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E9EBF3" strokeWidth={grosor} />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={colorArco}
        strokeWidth={grosor}
        strokeLinecap="round"
        strokeDasharray={`${frac * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {texto ? (
        <TextoSvg
          x={size / 2}
          y={size / 2 + fuente * 0.36}
          textAnchor="middle"
          fontSize={fuente}
          fontWeight="800"
          fill={colorArco}
          fontFamily={fuenteMono}
        >
          {texto}
        </TextoSvg>
      ) : null}
    </Svg>
  )
}

/** Gráfico de líneas con área degradada, cuadrícula y punto final destacado. */
export function GraficoLineas({
  puntos,
  etiquetaUltimo,
}: {
  puntos: PuntoSerie[]
  etiquetaUltimo?: string
}) {
  const [activo, setActivo] = useState<number | null>(null)
  const { width: anchoPantalla } = useWindowDimensions()

  const W = 560
  const H = 210
  const PX = 18
  const TOP = 26
  const BOT = 186

  const geo = useMemo(() => {
    if (puntos.length === 0) return null
    const maxV = Math.max(...puntos.map((p) => p.valor), 1)
    const techo = maxV * 1.12
    const paso = puntos.length > 1 ? (W - PX * 2) / (puntos.length - 1) : 0
    const xy = puntos.map((p, i) => {
      const x = puntos.length > 1 ? PX + i * paso : W / 2
      const y = BOT - (p.valor / techo) * (BOT - TOP)
      return [x, y] as const
    })
    const linea = 'M' + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')
    const area = `${linea} L${(W - PX).toFixed(1)},${BOT} L${PX},${BOT} Z`
    return { xy, linea, area }
  }, [puntos])

  if (!geo) {
    return (
      <TextoRN style={{ paddingVertical: 40, textAlign: 'center', fontSize: 12.5, color: color.text3 }}>
        Sin datos de tendencia para el período.
      </TextoRN>
    )
  }

  const ultimo = puntos.length - 1
  // El SVG escala al ancho disponible manteniendo la proporción del viewBox.
  const anchoSvg = Math.min(anchoPantalla - 72, 560)
  const altoSvg = (anchoSvg * H) / W

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={anchoSvg} height={altoSvg} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="area-tendencia" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color.navy} stopOpacity={0.14} />
            <Stop offset="100%" stopColor={color.navy} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {[TOP + 12, 70, 128, BOT].map((y) => (
          <Line key={y} x1={PX} x2={W - PX} y1={y} y2={y} stroke="#EFF1F8" strokeWidth={1} />
        ))}

        <Path d={geo.area} fill="url(#area-tendencia)" />
        <Path
          d={geo.linea}
          fill="none"
          stroke={color.navy}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {geo.xy.map(([x, y], i) => (
          <Circle
            key={i}
            cx={x}
            cy={y}
            r={i === ultimo ? 5 : activo === i ? 4.5 : 3}
            fill={i === ultimo ? color.orange : '#FFFFFF'}
            stroke={i === ultimo ? '#FFFFFF' : color.navy}
            strokeWidth={i === ultimo ? 2.5 : 1.5}
          />
        ))}

        {/* Zonas de toque para el tooltip (equivalente al hover del portal) */}
        {geo.xy.map(([x], i) => (
          <Rect
            key={`h-${i}`}
            x={x - 12}
            y={TOP - 10}
            width={24}
            height={BOT - TOP + 20}
            fill="transparent"
            onPress={() => setActivo((v) => (v === i ? null : i))}
          />
        ))}

        {activo !== null && activo !== ultimo && (
          <TextoSvg
            x={Math.min(Math.max(geo.xy[activo][0], 44), W - 44)}
            y={Math.max(geo.xy[activo][1] - 12, 14)}
            textAnchor="middle"
            fontSize={11}
            fontWeight="700"
            fill={color.navy}
            fontFamily={fuenteMono}
          >
            {`${puntos[activo].etiqueta}: ${numero(puntos[activo].valor)}`}
          </TextoSvg>
        )}

        {etiquetaUltimo ? (
          <TextoSvg
            x={W - PX}
            y={20}
            textAnchor="end"
            fontSize={12}
            fontWeight="700"
            fill={color.orange}
            fontFamily={fuenteMono}
          >
            {etiquetaUltimo}
          </TextoSvg>
        ) : null}

        <TextoSvg x={PX} y={H - 4} fontSize={10} fill={color.text3}>
          {puntos[0]?.etiqueta}
        </TextoSvg>
        <TextoSvg x={W - PX} y={H - 4} fontSize={10} fill={color.text3} textAnchor="end">
          {puntos[ultimo]?.etiqueta}
        </TextoSvg>
      </Svg>
    </View>
  )
}

export interface SegmentoDona {
  etiqueta: string
  valor: number
  color: string
}

/** Dona con total al centro. */
export function GraficoDona({
  segmentos,
  total,
  subtitulo = 'peritajes',
  size = 150,
}: {
  segmentos: SegmentoDona[]
  total: number
  subtitulo?: string
  size?: number
}) {
  const r = size * 0.373
  const C = 2 * Math.PI * r
  const suma = segmentos.reduce((a, s) => a + s.valor, 0)
  let acumulado = 0

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4FA" strokeWidth={15} />
      {suma > 0 &&
        segmentos.map((s) => {
          const frac = s.valor / suma
          const el = (
            <Circle
              key={s.etiqueta}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={15}
              strokeDasharray={`${Math.max(frac * C - 2, 0)} ${C}`}
              strokeDashoffset={-acumulado * C}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          acumulado += frac
          return el
        })}
      <TextoSvg
        x={size / 2}
        y={size / 2 + 2}
        textAnchor="middle"
        fontSize={19}
        fontWeight="800"
        fill={color.navy}
        fontFamily={fuenteMono}
      >
        {numero(total)}
      </TextoSvg>
      <TextoSvg x={size / 2} y={size / 2 + 18} textAnchor="middle" fontSize={9.5} fontWeight="600" fill={color.text3}>
        {subtitulo}
      </TextoSvg>
    </Svg>
  )
}

/** Barra horizontal de puntaje por grupo. */
export function BarraPuntaje({
  valor,
  max = 100,
  color: colorBarra,
}: {
  valor: number
  max?: number
  color: string
}) {
  const pct = Math.max(0, Math.min(100, max === 0 ? 0 : (valor / max) * 100))
  return (
    <View style={{ height: 7, backgroundColor: '#EDEFF8', borderRadius: 99, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${pct}%`, backgroundColor: colorBarra, borderRadius: 99 }} />
    </View>
  )
}

/** Punto naranja con etiqueta "en vivo" (versión estática del PulsoVivo del portal). */
export function PulsoVivo({ size = 30 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size * 0.62,
          height: size * 0.62,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: color.orange,
          opacity: 0.45,
        }}
      />
      <View style={{ width: size * 0.4, height: size * 0.4, borderRadius: 999, backgroundColor: color.orange }} />
    </View>
  )
}

/** Componente auxiliar de leyenda usado por Dashboard. */
export function LeyendaDona({ segmentos, total }: { segmentos: SegmentoDona[]; total: number }) {
  return (
    <View style={{ gap: 9, marginTop: 12, alignSelf: 'stretch' }}>
      {segmentos.map((s) => (
        <View key={s.etiqueta} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: s.color }} />
          <TextoRN style={{ fontSize: 12, color: color.text, fontWeight: '600' }}>{s.etiqueta}</TextoRN>
          <TextoRN
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              fontWeight: '700',
              color: color.navy,
              fontFamily: fuenteMono,
            }}
          >
            {total > 0 ? `${Math.round((s.valor / total) * 100)}% · ${numero(s.valor)}` : '—'}
          </TextoRN>
        </View>
      ))}
    </View>
  )
}
