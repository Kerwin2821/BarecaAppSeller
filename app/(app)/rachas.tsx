import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { rachasApi } from '@/lib/endpoints'
import { fetchPolizas } from '@/lib/polizas'
import type { DisplayPolicy } from '@/lib/tipos'
import { actorUuid, puedeVender } from '@/lib/roles'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { EstadoError, Skeleton } from '@/components/Estados'
import { Boton, Tarjeta } from '@/components/Ui'
import { color } from '@/lib/tema'

/**
 * Mis Rachas y Retos: réplica del hero "estilo Duolingo" del portal.
 * `/reporte/racha-resumen` → { racha, estado, mensaje, semana:[{dia,activo,esHoy,futuro}] }.
 * `/reporte/retos` → RetoProgreso[] { nombre, descripcion, premio, porcentaje, completado,
 * etiquetaProgreso, faltanteTexto, icono? }.
 */

const NARANJA = '#F97316'
const NARANJA_OSC = '#EA580C'

interface DatosRachas {
  resumen: any
  retos: any
  vendioHoy: boolean
}

/** ¿La fecha (ISO/date) cae hoy, en hora local del dispositivo? */
function esHoy(fecha?: string | null): boolean {
  if (!fecha) return false
  const d = new Date(fecha)
  if (isNaN(d.getTime())) return false
  const h = new Date()
  return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate()
}

export default function Rachas() {
  const { user } = useAuth()

  const cargar = useCallback(async (): Promise<DatosRachas | null> => {
    if (!user) return null
    const id = actorUuid(user) ?? undefined
    if (id === undefined) return null
    const [resResumen, resRetos, pols] = await Promise.all([
      rachasApi.resumen(user.role, id),
      rachasApi.retos(user.role, id),
      fetchPolizas(user, 'vehicle', 0, 5).then((x) => x.items).catch(() => [] as DisplayPolicy[]),
    ])
    // La app detecta una venta de HOY aunque el backend aún no la cuente en la racha.
    const vendioHoy = pols.some((p) => esHoy(p.saleDate))
    return { resumen: (resResumen as any)?.data ?? null, retos: (resRetos as any)?.data ?? null, vendioHoy }
  }, [user])

  const { datos, cargando, error, recargar } = useApi<DatosRachas | null>(cargar, [user?.loginId])

  const resumen = datos?.resumen
  const retos: any[] = Array.isArray(datos?.retos) ? datos!.retos : ((datos?.retos as any)?.items ?? [])
  const completados = retos.filter((r) => r?.completado).length

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla titulo="🔥 Mis Rachas y Retos" detalle="Mantén tu ritmo de ventas y gana premios" />

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : cargando ? (
        <SkeletonRachas />
      ) : (
        <View style={{ gap: 14 }}>
          {resumen ? <Hero r={resumen} vendioHoy={!!datos?.vendioHoy} /> : null}
          {resumen ? <GuiaRacha r={resumen} vendioHoy={!!datos?.vendioHoy} /> : null}

          {completados > 0 ? (
            <View style={est.banner}>
              <Text style={est.bannerTxt}>
                🎉 ¡Felicidades! Has completado {completados} reto{completados === 1 ? '' : 's'}. Tu premio está en camino.
              </Text>
            </View>
          ) : null}

          <Text style={est.seccion}>🎯 Retos activos</Text>
          {retos.length === 0 ? (
            <Tarjeta style={{ padding: 18 }}>
              <Text style={est.vacio}>Por ahora no hay retos activos. ¡Vuelve pronto!</Text>
            </Tarjeta>
          ) : (
            <View style={{ gap: 12 }}>
              {retos.map((r, i) => (
                <TarjetaReto key={r?.id ?? i} reto={r} />
              ))}
            </View>
          )}
        </View>
      )}
    </Pantalla>
  )
}

function Hero({ r, vendioHoy }: { r: any; vendioHoy?: boolean }) {
  const peligro = (r?.estado === 'peligro' || r?.enPeligro === true) && !vendioHoy
  const racha = typeof r?.racha === 'number' ? r.racha : 0
  const semana: any[] = Array.isArray(r?.semana) ? r.semana : []

  return (
    <View>
      <View style={est.hero}>
        <Text style={est.avatar}>{peligro ? '😢' : '😄'}</Text>
        <View style={est.rachaCard}>
          <Text style={est.rachaLbl}>MI RACHA</Text>
          <Text style={est.rachaNum}>
            🔥 {racha} {racha === 1 ? 'DÍA' : 'DÍAS'}
          </Text>
          {semana.length > 0 ? (
            <View style={est.semana}>
              {semana.map((d, i) => {
                const act = d?.activo || (vendioHoy && d?.esHoy)
                return (
                  <View key={i} style={est.dia}>
                    <Text style={est.diaLbl}>{d?.dia ?? ''}</Text>
                    <View style={[est.diaDot, act ? est.diaDotActivo : d?.esHoy ? est.diaDotHoy : est.diaDotFuturo]}>
                      <Text style={[est.diaDotTxt, act ? { color: NARANJA_OSC } : { color: '#fff' }]}>
                        {act ? '✓' : d?.esHoy ? '•' : ''}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          ) : null}
        </View>
      </View>
      {vendioHoy ? (
        <Text style={[est.mensaje, { color: color.success }]}>¡Vas al día! Ya registraste una venta hoy. 🔥</Text>
      ) : r?.mensaje ? (
        <Text style={[est.mensaje, peligro && { color: color.danger }]}>{String(r.mensaje)}</Text>
      ) : null}
    </View>
  )
}

/** Guía accionable de cómo cumplir la racha (más marcada cuando está en peligro). */
function GuiaRacha({ r, vendioHoy }: { r: any; vendioHoy?: boolean }) {
  const router = useRouter()
  const { user } = useAuth()
  const peligro = (r?.estado === 'peligro' || r?.enPeligro === true) && !vendioHoy
  const racha = typeof r?.racha === 'number' ? r.racha : 0
  const puedeV = puedeVender(user?.role)
  const PASOS = [
    'Emite al menos 1 póliza hoy.',
    'Cada día con una venta mantiene y suma tu racha.',
    'Si dejas pasar un día sin ventas, la racha vuelve a 0.',
  ]
  return (
    <Tarjeta style={[est.guia, peligro && { borderColor: color.danger, borderWidth: 1.5 }]}>
      <Text style={est.guiaTitulo}>{peligro ? '⚠️ ¿Cómo salvo mi racha?' : '✅ ¿Cómo mantengo mi racha?'}</Text>
      <Text style={[est.guiaSub, peligro && { color: color.danger }]}>
        {peligro
          ? racha > 0
            ? `Hoy aún no registras ventas. Emite 1 póliza para no perder tu racha de ${racha} ${racha === 1 ? 'día' : 'días'}.`
            : 'Aún no tienes racha. Emite 1 póliza hoy para empezarla.'
          : 'Vas al día. Sigue emitiendo para conservar tu racha.'}
      </Text>
      <View style={{ gap: 8, marginTop: 12 }}>
        {PASOS.map((p, i) => (
          <View key={i} style={est.guiaPaso}>
            <Text style={est.guiaPasoIco}>{i + 1}</Text>
            <Text style={est.guiaPasoTxt}>{p}</Text>
          </View>
        ))}
      </View>
      {puedeV ? (
        <Boton texto="Vender ahora" onPress={() => router.navigate('/nueva-venta' as never)} style={{ marginTop: 14 }} />
      ) : null}
    </Tarjeta>
  )
}

function TarjetaReto({ reto }: { reto: any }) {
  const nombre = reto?.nombre ?? 'Reto'
  const descripcion = reto?.descripcion
  const premio = reto?.premio
  const porcentaje = typeof reto?.porcentaje === 'number' ? Math.max(0, Math.min(100, reto.porcentaje)) : 0
  const completado = !!reto?.completado
  const etiqueta = reto?.etiquetaProgreso
  const falta = reto?.faltanteTexto
  const icono = reto?.icono ?? '🎯'

  return (
    <Tarjeta style={[est.reto, completado && { borderColor: color.success, borderWidth: 1.5 }]}>
      <View style={est.retoTop}>
        <Text style={est.retoIcono}>{icono}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={est.retoNombre}>{String(nombre)}</Text>
          {descripcion ? <Text style={est.retoDesc}>{String(descripcion)}</Text> : null}
        </View>
      </View>

      <View style={est.premio}>
        <Text style={est.premioLbl}>Premio</Text>
        <Text style={est.premioVal}>🎁 {premio || '—'}</Text>
      </View>

      <View style={est.barra}>
        <View style={[est.barraFill, { width: `${porcentaje}%`, backgroundColor: completado ? color.success : color.primary }]} />
      </View>
      <View style={est.barraRow}>
        {etiqueta ? <Text style={est.prog}>{String(etiqueta)}</Text> : <View />}
        <Text style={est.pct}>{porcentaje}%</Text>
      </View>

      {falta ? (
        <Text style={[est.falta, completado && { color: color.success, fontWeight: '700' }]}>
          {completado ? `✅ ${falta}` : String(falta)}
        </Text>
      ) : null}
    </Tarjeta>
  )
}

function SkeletonRachas() {
  return (
    <View style={{ gap: 14 }}>
      <View style={est.hero}>
        <Skeleton w={56} h={56} r={28} />
        <View style={[est.rachaCard, { backgroundColor: '#FDBA74' }]}>
          <Skeleton w={90} h={12} />
          <Skeleton w={130} h={22} style={{ marginTop: 8 }} />
          <View style={est.semana}>
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} w={22} h={34} r={8} />
            ))}
          </View>
        </View>
      </View>
      {Array.from({ length: 2 }).map((_, i) => (
        <Tarjeta key={i} style={est.reto}>
          <Skeleton w="55%" h={14} />
          <Skeleton w="82%" h={11} style={{ marginTop: 8 }} />
          <Skeleton w="100%" h={8} r={99} style={{ marginTop: 14 }} />
        </Tarjeta>
      ))}
    </View>
  )
}

const est = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { fontSize: 44 },
  rachaCard: {
    flex: 1,
    backgroundColor: NARANJA,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: NARANJA_OSC,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  rachaLbl: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#FFEAD5' },
  rachaNum: { fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 2, letterSpacing: -0.4 },
  semana: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  dia: { alignItems: 'center', gap: 5, flex: 1 },
  diaLbl: { fontSize: 10.5, fontWeight: '800', color: '#FFEAD5' },
  diaDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  diaDotActivo: { backgroundColor: '#fff' },
  diaDotHoy: { backgroundColor: 'rgba(255,255,255,0.28)', borderWidth: 1.5, borderColor: '#fff' },
  diaDotFuturo: { backgroundColor: 'rgba(255,255,255,0.18)' },
  diaDotTxt: { fontSize: 12, fontWeight: '900' },
  mensaje: { fontSize: 13, fontWeight: '700', color: color.text2, marginTop: 12, textAlign: 'center' },
  banner: {
    backgroundColor: color.successBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.success,
    padding: 14,
  },
  bannerTxt: { fontSize: 12.5, fontWeight: '700', color: color.success, lineHeight: 18 },
  seccion: { fontSize: 15, fontWeight: '800', color: color.text },
  vacio: { fontSize: 13, color: color.text3, textAlign: 'center' },
  guia: { padding: 16 },
  guiaTitulo: { fontSize: 14.5, fontWeight: '800', color: color.text },
  guiaSub: { fontSize: 12.5, color: color.text2, marginTop: 5, lineHeight: 18, fontWeight: '600' },
  guiaPaso: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  guiaPasoIco: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.primaryLight,
    color: color.primary,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 20,
    overflow: 'hidden',
  },
  guiaPasoTxt: { flex: 1, fontSize: 12.5, color: color.text2, lineHeight: 18 },
  reto: { padding: 16 },
  retoTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  retoIcono: { fontSize: 26 },
  retoNombre: { fontSize: 14.5, fontWeight: '800', color: color.text },
  retoDesc: { fontSize: 12, color: color.text2, marginTop: 3, lineHeight: 17 },
  premio: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  premioLbl: { fontSize: 11, fontWeight: '700', color: color.text3, letterSpacing: 0.3 },
  premioVal: { fontSize: 12.5, fontWeight: '800', color: color.primaryDark },
  barra: { height: 9, backgroundColor: color.borderSoft, borderRadius: 99, overflow: 'hidden', marginTop: 12 },
  barraFill: { height: '100%', borderRadius: 99 },
  barraRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 },
  prog: { fontSize: 11.5, fontWeight: '700', color: color.text2 },
  pct: { fontSize: 11.5, fontWeight: '800', color: color.primary },
  falta: { fontSize: 11.5, color: color.text3, marginTop: 8 },
})
