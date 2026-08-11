import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { rachasApi } from '@/lib/endpoints'
import { actorUuid } from '@/lib/roles'
import { numero } from '@/lib/formato'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Tarjeta, Pildora, Chip, TituloSeccion } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

/**
 * Mis Rachas: racha de días con ventas + retos/incentivos del vendedor.
 * Carga en paralelo `/reporte/racha-resumen` y `/reporte/retos` (BFF). El
 * contrato es incierto, así que todo se lee de forma defensiva (`??`, chaining).
 */

interface DatosRachas {
  resumen: any
  retos: any
}

/** Número seguro (0 si no es un número válido). */
function num(v: unknown): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0
}

/** Normaliza `diasSemana` (array de booleans o de `{cumplido}`) a boolean[]. */
function normalizarDias(raw: unknown): boolean[] {
  if (!Array.isArray(raw)) return []
  return raw.map((d) =>
    typeof d === 'boolean' ? d : !!((d as any)?.cumplido ?? (d as any)?.completado ?? (d as any)?.activo),
  )
}

/** Normaliza los retos: acepta array directo o `{ items: [] }`. */
function normalizarRetos(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (Array.isArray((raw as any)?.items)) return (raw as any).items
  return []
}

export default function Rachas() {
  const { user } = useAuth()

  const cargar = useCallback(async (): Promise<DatosRachas | null> => {
    if (!user) return null
    const id = actorUuid(user) ?? undefined
    if (id === undefined) return null
    const [resResumen, resRetos] = await Promise.all([
      rachasApi.resumen(user.role, id),
      rachasApi.retos(user.role, id),
    ])
    return { resumen: resResumen?.data ?? null, retos: resRetos?.data ?? null }
  }, [user])

  const { datos, cargando, error, recargar } = useApi<DatosRachas | null>(cargar, [user?.loginId])

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla titulo="Mis Rachas" detalle="Metas e incentivos por tus ventas" />

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : cargando ? (
        <SkeletonRachas />
      ) : !datos ? (
        <Tarjeta>
          <EstadoVacio
            titulo="Sin datos de retos"
            detalle="Aún no hay rachas ni retos disponibles para tu perfil."
          />
        </Tarjeta>
      ) : (
        <Contenido resumen={datos.resumen} retos={datos.retos} />
      )}
    </Pantalla>
  )
}

function Contenido({ resumen, retos }: { resumen: any; retos: any }) {
  const rachaActual = num(resumen?.rachaActual ?? resumen?.streak ?? resumen?.diasConsecutivos)
  const mejorRacha = resumen?.mejorRacha ?? resumen?.maxima
  const dias = normalizarDias(resumen?.diasSemana)
  const lista = normalizarRetos(retos)

  return (
    <View style={{ gap: 12 }}>
      <TarjetaRacha rachaActual={rachaActual} mejorRacha={mejorRacha} dias={dias} />

      {lista.length > 0 ? (
        <>
          <TituloSeccion>Retos activos</TituloSeccion>
          <View style={{ gap: 12 }}>
            {lista.map((r, i) => (
              <TarjetaReto key={r?.id ?? r?.retoId ?? i} reto={r} />
            ))}
          </View>
        </>
      ) : (
        <Tarjeta>
          <EstadoVacio
            titulo="Sin retos activos"
            detalle="Cuando tengas retos asignados aparecerán aquí con su progreso y premio."
          />
        </Tarjeta>
      )}
    </View>
  )
}

const LETRAS_DIA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function TarjetaRacha({
  rachaActual,
  mejorRacha,
  dias,
}: {
  rachaActual: number
  mejorRacha: unknown
  dias: boolean[]
}) {
  return (
    <Tarjeta style={est.racha}>
      <Text style={est.rachaNumero}>{numero(rachaActual)}</Text>
      <Text style={est.rachaEtiqueta}>días seguidos</Text>

      {typeof mejorRacha === 'number' ? (
        <Text style={est.rachaMejor}>
          Tu mejor racha: <Text style={{ fontWeight: '800', color: color.text }}>{numero(mejorRacha)} días</Text>
        </Text>
      ) : null}

      {dias.length > 0 ? (
        <View style={est.diasFila}>
          {dias.map((cumplido, i) => (
            <View key={i} style={est.diaItem}>
              <View style={[est.punto, { backgroundColor: cumplido ? color.success : color.border }]} />
              {dias.length === 7 ? <Text style={est.diaLetra}>{LETRAS_DIA[i]}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </Tarjeta>
  )
}

function TarjetaReto({ reto }: { reto: any }) {
  const nombre = reto?.nombre ?? reto?.titulo ?? 'Reto'
  const descripcion = reto?.descripcion
  const meta = typeof reto?.meta === 'number' ? reto.meta : typeof reto?.objetivo === 'number' ? reto.objetivo : undefined
  const progreso = num(reto?.progreso ?? reto?.actual)
  const premio = reto?.premio ?? reto?.recompensa
  const cumplido = !!(reto?.cumplido ?? reto?.completado)
  const pct = cumplido ? 100 : meta && meta > 0 ? Math.min(100, (progreso / meta) * 100) : 0

  return (
    <Tarjeta style={est.reto}>
      <View style={est.retoCabecera}>
        <Text style={est.retoNombre}>{String(nombre)}</Text>
        {cumplido ? <Pildora texto="Completado" color={color.success} /> : null}
      </View>

      {descripcion ? <Text style={est.retoDesc}>{String(descripcion)}</Text> : null}

      <View style={est.barraFondo}>
        <View style={[est.barra, { width: `${pct}%`, backgroundColor: cumplido ? color.success : color.primary }]} />
      </View>

      <View style={est.retoPie}>
        <Text style={est.retoProgreso}>
          {numero(progreso)} / {meta !== undefined ? numero(meta) : '—'}
        </Text>
        {premio !== undefined && premio !== null && premio !== '' ? (
          <Chip texto={`Premio: ${String(premio)}`} fondo={color.primaryLight} colorTexto={color.primaryDark} />
        ) : null}
      </View>
    </Tarjeta>
  )
}

function SkeletonRachas() {
  return (
    <View style={{ gap: 12 }}>
      <Tarjeta style={est.racha}>
        <Skeleton w={92} h={44} r={12} />
        <Skeleton w={110} h={12} style={{ marginTop: 12 }} />
        <View style={est.diasFila}>
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} w={12} h={12} r={6} />
          ))}
        </View>
      </Tarjeta>
      {Array.from({ length: 2 }).map((_, i) => (
        <Tarjeta key={i} style={est.reto}>
          <Skeleton w="55%" h={14} />
          <Skeleton w="82%" h={11} style={{ marginTop: 8 }} />
          <Skeleton w="100%" h={8} r={99} style={{ marginTop: 14 }} />
          <Skeleton w="42%" h={11} style={{ marginTop: 10 }} />
        </Tarjeta>
      ))}
    </View>
  )
}

const est = StyleSheet.create({
  racha: { padding: 20, alignItems: 'center' },
  rachaNumero: { fontSize: 48, fontWeight: '800', color: color.primary, letterSpacing: -1.2, fontFamily: fuenteMono },
  rachaEtiqueta: { fontSize: 12.5, fontWeight: '700', color: color.text3, letterSpacing: 0.3, marginTop: 2 },
  rachaMejor: { fontSize: 12.5, color: color.text2, marginTop: 10 },
  diasFila: { flexDirection: 'row', gap: 12, marginTop: 18 },
  diaItem: { alignItems: 'center', gap: 5 },
  punto: { width: 12, height: 12, borderRadius: 6 },
  diaLetra: { fontSize: 10, fontWeight: '700', color: color.text4 },

  reto: { padding: 16 },
  retoCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  retoNombre: { flex: 1, fontSize: 14, fontWeight: '800', color: color.text, letterSpacing: -0.2 },
  retoDesc: { fontSize: 12.5, color: color.text2, marginTop: 4, lineHeight: 18 },
  barraFondo: { height: 8, backgroundColor: color.borderSoft, borderRadius: 99, overflow: 'hidden', marginTop: 14 },
  barra: { height: '100%', borderRadius: 99 },
  retoPie: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 },
  retoProgreso: { fontSize: 12, fontWeight: '700', color: color.text2, fontFamily: fuenteMono },
})
