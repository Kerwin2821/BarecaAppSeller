import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg'
import { useFocusEffect, useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { authApi, comisionApi, rachasApi, userApi, walletApi } from '@/lib/endpoints'
import { desenvolver, mensajeDeError } from '@/lib/api'
import { fetchPolizas } from '@/lib/polizas'
import { actorUuid } from '@/lib/roles'
import { fechaCorta, moneda } from '@/lib/formato'
import { bancoInfo } from '@/lib/bancos'
import type { DisplayPolicy } from '@/lib/tipos'
import { Pantalla } from '@/components/Pantalla'
import { CargandoBloque, EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Alerta, Avatar, Boton, Pildora, Tarjeta } from '@/components/Ui'
import { Modal } from '@/components/Modal'
import { Dropdown, type OpcionDrop } from '@/components/Dropdown'
import { BannerAseguradoras } from '@/components/BannerAseguradoras'
import { IcoEquipo, IcoRachas, IcoReporte, IcoSoporte } from '@/components/Iconos'
import { useToast } from '@/components/Toast'
import { ObjetivoTour, useObjetivoTour, useTour } from '@/lib/tour'
import { registrarPush } from '@/lib/push'
import { tourVisto } from '@/lib/onboarding'
import { vendioHoyLocal } from '@/lib/ventaLocal'
import { color } from '@/lib/tema'

// Marca + mascota + logos de aseguradora — empaquetados en el app.
// Versión blanca (fondo transparente) para integrarla sobre la tarjeta de color.
const LOGO_BARECA_BLANCO = require('../../assets/logo-bareca-blanco.png')
const CARA_TRISTE = require('../../assets/racha-triste.png')
const CARA_FELIZ = require('../../assets/racha-feliz.png')

/** ¿La fecha (ISO/date) cae hoy, en hora local del dispositivo? */
function esHoy(fecha?: string | null): boolean {
  if (!fecha) return false
  const s = String(fecha).trim()
  // "YYYY-MM-DD" sin hora → interpretarla como medianoche LOCAL (evita el corrimiento
  // de día que provoca `new Date('YYYY-MM-DD')` al tratarla como UTC en zonas < 0).
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s
  const d = new Date(iso)
  if (isNaN(d.getTime())) return false
  const h = new Date()
  return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate()
}
const LOGOS_ASEG: { re: RegExp; src: number }[] = [
  { re: /caron/i, src: require('../../assets/logos/logo-caroni-color.png') },
  { re: /estar/i, src: require('../../assets/logos/logo-estar-seguros.png') },
  { re: /occidental/i, src: require('../../assets/logos/logo-laoccidental.png') },
]
function LogoAseg({ nombre }: { nombre?: string }) {
  const logo = LOGOS_ASEG.find((l) => l.re.test(nombre || ''))
  if (!logo) return null
  // Logo grande, integrado (sin recuadro) y alineado a la izquierda.
  return <Image source={logo.src} resizeMode="contain" style={{ height: 24, width: 92, alignSelf: 'flex-start' }} />
}

function iniciales(n: string): string {
  return (
    n
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || '·'
  )
}

export default function Home() {
  const router = useRouter()
  const { user } = useAuth()
  const [retiro, setRetiro] = useState(false)

  // Registra el token de push (FCM) del dispositivo cuando hay sesión. En Expo Go
  // no hace nada (requiere development build); no bloquea el resto del home.
  useEffect(() => {
    if (user) void registrarPush(user)
  }, [user?.loginId])

  // Visita guiada (spotlight) la primera vez que se entra al app. El objetivo de la
  // tarjeta de comisión se registra aquí; el tour arranca cuando el home ya cargó.
  const { iniciar: iniciarTour } = useTour()
  const refComision = useObjetivoTour('comision')
  const [primeraVezTour, setPrimeraVezTour] = useState(false)
  useEffect(() => {
    tourVisto().then((v) => setPrimeraVezTour(!v))
  }, [])

  const cargar = useCallback(async () => {
    if (!user) return null
    const uuid = actorUuid(user) ?? ''
    const entidadPromesa: Promise<any> = !uuid
      ? Promise.resolve(null)
      : user.role === 'DISTRIBUIDOR'
        ? userApi.distribuidorByUuid(uuid)
        : user.role === 'KIOSCO'
          ? userApi.kioscoByUuid(uuid)
          : user.role === 'OFICINA_REGIONAL'
            ? userApi.oficinaByUuid(uuid)
            : user.role === 'BARECA'
              ? userApi.barecaByUuid(uuid)
              : Promise.resolve(null)
    const [tot, res, pol, ent, foto, wal] = await Promise.all([
      uuid ? comisionApi.totales(user.role, uuid).then((r) => desenvolver(r) as any).catch(() => null) : Promise.resolve(null),
      uuid ? rachasApi.resumen(user.role, uuid).then((r: any) => r?.data ?? null).catch(() => null) : Promise.resolve(null),
      fetchPolizas(user, 'vehicle', 0, 5).then((r) => r.items).catch(() => [] as DisplayPolicy[]),
      entidadPromesa.then((e: any) => e?.nombre ?? null).catch(() => null),
      authApi.obtenerFoto(user.loginId).then((r: any) => r?.data?.url ?? null).catch(() => null),
      // Saldo de la billetera: es el dinero realmente disponible del vendedor.
      uuid ? walletApi.miWallet(user.role, uuid).catch(() => null) : Promise.resolve(null),
    ])
    return { tot, res, pol, nombreEnt: ent, foto, wallet: wal }
  }, [user])
  const { datos, cargando, error, recargar } = useApi(cargar, [user?.loginId])

  // Flag local "vendí hoy" + recarga al enfocar el home (p.ej. al volver de emitir una
  // venta): así Beca se pone feliz al instante y los datos (comisión, pólizas) se
  // refrescan sin tener que salir y volver a entrar al app.
  const [ventaLocalHoy, setVentaLocalHoy] = useState(false)
  const yaMonto = useRef(false)
  useFocusEffect(
    useCallback(() => {
      vendioHoyLocal(user?.loginId).then(setVentaLocalHoy)
      if (!yaMonto.current) {
        yaMonto.current = true // el montaje ya dispara la carga vía useApi
        return
      }
      recargar()
    }, [user?.loginId, recargar]),
  )

  const tot = datos?.tot
  // La billetera es la fuente del saldo disponible; si aún no responde, se usa el
  // pendiente de comisiones como respaldo (compatibilidad con el esquema anterior).
  const w: any = datos?.wallet
  const saldoWallet: number | null =
    w == null ? null : Number(w?.saldo ?? w?.data?.saldo ?? 0) || 0
  const pendiente = saldoWallet ?? tot?.totalPendiente ?? tot?.pendiente ?? tot?.montoPendiente ?? 0
  const pagada = tot?.totalPagada ?? tot?.pagado ?? 0
  const historico = tot?.totalHistorico ?? tot?.total ?? 0
  const res = datos?.res
  const polizas: DisplayPolicy[] = datos?.pol ?? []
  // Beca feliz si: el backend lo dice, hay una póliza de HOY en la lista, o el flag
  // LOCAL "vendí hoy" está puesto (se marca al emitir, sin depender del backend/zona horaria).
  const vendioHoy = polizas.some((p) => esHoy(p.saleDate))
  const cumpliendo = res ? res.estado === 'feliz' || res.hoyVendio === true || vendioHoy || ventaLocalHoy : null
  const foto = datos?.foto ?? null
  const nombre = datos?.nombreEnt || `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Vendedor'

  // Arranca la visita guiada una sola vez, cuando el home ya no está cargando (así los
  // objetivos —tarjeta, accesos— están montados y se pueden medir).
  useEffect(() => {
    if (!primeraVezTour || cargando) return
    setPrimeraVezTour(false)
    const t = setTimeout(() => iniciarTour(), 350)
    return () => clearTimeout(t)
  }, [primeraVezTour, cargando, iniciarTour])

  return (
    <Pantalla onRefresh={recargar}>
      {/* Saludo: foto de perfil + nombre + carita de meta (toca → Rachas) */}
      <View style={est.saludoFila}>
        <Pressable onPress={() => router.navigate('/perfil' as never)} hitSlop={6}>
          {foto ? (
            <Image source={{ uri: foto }} style={est.avatarFoto} />
          ) : (
            <Avatar texto={iniciales(nombre)} size={54} invertido />
          )}
        </Pressable>
        <View style={[{ flex: 1, minWidth: 0 }, res ? { paddingRight: 96 } : null]}>
          <Text style={est.saludo}>Hola 👋</Text>
          <Text style={est.nombreEnt} numberOfLines={res && !cumpliendo ? 1 : 2}>
            {nombre}
          </Text>
          {res && !cumpliendo && res.mensaje ? (
            <Text style={est.rachaAlerta} numberOfLines={3}>
              {String(res.mensaje)}
            </Text>
          ) : null}
        </View>
        {res ? (
          <Pressable onPress={() => router.navigate('/rachas' as never)} style={est.mascotaWrap} hitSlop={6}>
            <Image source={cumpliendo ? CARA_FELIZ : CARA_TRISTE} resizeMode="contain" style={est.mascota} />
          </Pressable>
        ) : null}
      </View>

      {error && !tot ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : (
        <>
          {/* Tarjeta de comisión (estilo tarjeta de crédito, con el logo Bareca) */}
          {cargando && !tot ? (
            // Skeleton con la FORMA de la tarjeta (navy + barras tenues) y del botón,
            // para que la carga se vea intencional y no salte cuando llegan los datos.
            <>
              <View style={est.cardShadow}>
                <View style={est.card}>
                  <View style={est.cardInner}>
                    <View style={est.cardTop}>
                      <View style={[est.skelBar, { width: 130, height: 12 }]} />
                      <View style={[est.skelBar, { width: 86, height: 22, opacity: 0.5 }]} />
                    </View>
                    <View style={[est.skelBar, { width: 190, height: 30, marginTop: 16 }]} />
                    <View style={[est.cardStats, { marginTop: 18 }]}>
                      <View>
                        <View style={[est.skelBar, { width: 56, height: 10 }]} />
                        <View style={[est.skelBar, { width: 100, height: 16, marginTop: 8 }]} />
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={[est.skelBar, { width: 56, height: 10 }]} />
                        <View style={[est.skelBar, { width: 100, height: 16, marginTop: 8 }]} />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
              <View style={{ marginTop: 16, height: 50, borderRadius: 14, backgroundColor: color.accent, opacity: 0.4 }} />
            </>
          ) : (
            <>
              <Pressable ref={refComision} collapsable={false} style={est.cardShadow} onPress={() => router.navigate('/billetera' as never)}>
                <View style={est.card}>
                  <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                    <Defs>
                      <SvgGradient id="gcard" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor={color.primaryDark} />
                        <Stop offset="0.5" stopColor={color.primary} />
                        <Stop offset="1" stopColor={color.accent} />
                      </SvgGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" fill="url(#gcard)" />
                  </Svg>
                  <View style={est.cardInner}>
                    <View style={est.cardTop}>
                      <Text style={est.cardLbl}>{saldoWallet != null ? 'Saldo en billetera' : 'Comisión acumulada'}</Text>
                      <Image source={LOGO_BARECA_BLANCO} resizeMode="contain" style={est.cardLogo} />
                    </View>
                    <Text style={est.cardMonto} numberOfLines={1} adjustsFontSizeToFit>
                      {moneda(pendiente)}
                    </Text>
                    <View style={est.cardStats}>
                      <View>
                        <Text style={est.cardStatLbl}>Pagado</Text>
                        <Text style={est.cardStatVal} numberOfLines={1} adjustsFontSizeToFit>
                          {moneda(pagada)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={est.cardStatLbl}>Histórico</Text>
                        <Text style={est.cardStatVal} numberOfLines={1} adjustsFontSizeToFit>
                          {moneda(historico)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </Pressable>
              <ObjetivoTour id="retirar" style={{ marginTop: 16 }}>
                <Boton texto="Retirar comisión" variante="accent" onPress={() => setRetiro(true)} />
              </ObjetivoTour>
            </>
          )}

          {/* Banner de aseguradoras (debajo de Retirar comisión) */}
          <BannerAseguradoras />

          {/* Accesos rápidos */}
          <View style={est.accesos}>
            <Acceso idTour="acc-reporte" Icono={IcoReporte} texto="Reporte" onPress={() => router.navigate('/reporte' as never)} />
            <Acceso idTour="acc-rachas" Icono={IcoRachas} texto="Rachas" onPress={() => router.navigate('/rachas' as never)} />
            <Acceso idTour="acc-equipo" Icono={IcoEquipo} texto="Equipo" onPress={() => router.navigate('/equipo' as never)} />
            <Acceso idTour="acc-soporte" Icono={IcoSoporte} texto="Soporte" onPress={() => router.navigate('/soporte' as never)} />
          </View>

          {/* Últimas pólizas */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 8 }}>
            <Text style={est.seccion}>Últimas pólizas</Text>
            <Pressable onPress={() => router.navigate('/polizas' as never)} hitSlop={8}>
              <Text style={est.verTodas}>Ver todas ›</Text>
            </Pressable>
          </View>

          {cargando && polizas.length === 0 ? (
            <CargandoBloque texto="Cargando pólizas…" />
          ) : polizas.length === 0 ? (
            <Tarjeta>
              <EstadoVacio titulo="Sin pólizas aún" detalle="Cuando emitas tu primera venta aparecerá aquí." />
            </Tarjeta>
          ) : (
            <View style={{ gap: 8 }}>
              {polizas.map((p) => (
                <Pressable key={`${p.category}-${p.id}`} onPress={() => router.push(`/polizas/${p.id}?cat=${p.category}` as never)}>
                  <Tarjeta style={est.polCard}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={est.polCliente} numberOfLines={1}>
                        {p.clientName}
                      </Text>
                      <View style={est.polAseg}>
                        <LogoAseg nombre={p.productName} />
                        <Text style={est.polAsegTxt} numberOfLines={1}>
                          {p.productName}
                        </Text>
                      </View>
                      <Text style={est.polFecha}>
                        Nº {p.policyNumber || '—'} · {fechaCorta(p.saleDate)}
                      </Text>
                    </View>
                    <Pildora
                      color={p.status === 'Vigente' ? color.vigente : p.status === 'Inactiva' ? color.inactiva : color.procesado}
                      texto={p.status}
                    />
                  </Tarjeta>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      <ModalRetiro
        abierto={retiro}
        disponible={pendiente}
        onCerrar={() => setRetiro(false)}
        onListo={() => {
          setRetiro(false)
          recargar()
        }}
      />

    </Pantalla>
  )
}

function Acceso({
  Icono,
  texto,
  onPress,
  idTour,
}: {
  Icono: ComponentType<{ color: string; size?: number }>
  texto: string
  onPress: () => void
  idTour: string
}) {
  const ref = useObjetivoTour(idTour)
  return (
    <Pressable ref={ref} collapsable={false} style={est.acceso} onPress={onPress}>
      <View style={est.accesoIcono}>
        <Icono color={color.accent} size={20} />
      </View>
      <Text style={est.accesoTxt}>{texto}</Text>
    </Pressable>
  )
}

/* ── Retirar comisión (genera una solicitud de orden de pago) ── */
function ModalRetiro({
  abierto,
  disponible,
  onCerrar,
  onListo,
}: {
  abierto: boolean
  disponible: number
  onCerrar: () => void
  onListo: () => void
}) {
  const { user } = useAuth()
  const { avisar } = useToast()
  const [metodos, setMetodos] = useState<any[]>([])
  const [datosPagosId, setDatosPagosId] = useState<string | null>(null)
  const [medio, setMedio] = useState<'PAGO_MOVIL' | 'TRANSFERENCIA' | 'EFECTIVO'>('PAGO_MOVIL')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || !user) return
    setError(null)
    const uuid = actorUuid(user)
    if (!uuid) return
    userApi
      .datosPagosByActor(user.role, uuid)
      .then((r: any) => {
        const arr = (r?.data ?? []) as any[]
        setMetodos(arr)
        setDatosPagosId(arr[0] ? String(arr[0].datosPagosId ?? arr[0].id) : null)
      })
      .catch(() => setMetodos([]))
  }, [abierto, user])

  const opcMetodos: OpcionDrop[] = metodos.map((m) => ({
    valor: String(m.datosPagosId ?? m.id),
    texto: `${m.alias ?? 'Cuenta'} · ${bancoInfo(m.banco, m.banco).nombre}`,
  }))
  const opcMedio: OpcionDrop[] = [
    { valor: 'PAGO_MOVIL', texto: 'Pago Móvil' },
    { valor: 'TRANSFERENCIA', texto: 'Transferencia' },
    { valor: 'EFECTIVO', texto: 'Efectivo' },
  ]

  const confirmar = async () => {
    if (enviando || !user) return
    const uuid = actorUuid(user) ?? ''
    if (!datosPagosId) {
      setError('Selecciona una cuenta de cobro.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await comisionApi.generarOrden({
        tipoActor: user.role,
        actorUuid: uuid,
        medioPago: medio,
        observaciones: 'Solicitud de retiro desde el app',
        datosPagosId,
      })
      avisar('Solicitud de retiro enviada. La oficina la procesará.', 'ok')
      onListo()
    } catch (e) {
      setError(mensajeDeError(e))
      setEnviando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Retirar comisión" subtitulo={`Disponible: ${moneda(disponible)}`}>
      <View style={{ gap: 14 }}>
        {metodos.length === 0 ? (
          <Alerta tipo="info">
            Aún no tienes cuentas de cobro. Agrega una en Perfil › Métodos de Cobro para poder retirar.
          </Alerta>
        ) : (
          <Dropdown etiqueta="Cuenta de cobro" opciones={opcMetodos} valor={datosPagosId} onCambiar={setDatosPagosId} />
        )}
        <Dropdown etiqueta="Medio de pago" opciones={opcMedio} valor={medio} onCambiar={(v) => setMedio(v as typeof medio)} />
        <Text style={est.notaRetiro}>
          Se enviará una solicitud de retiro por {moneda(disponible)}. El pago lo procesa la oficina; no se descuenta de forma
          automática.
        </Text>
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Boton texto="Cancelar" variante="soft" onPress={onCerrar} style={{ flex: 1 }} />
          <Boton
            texto={enviando ? 'Enviando…' : 'Confirmar retiro'}
            onPress={confirmar}
            cargando={enviando}
            disabled={metodos.length === 0}
            style={{ flex: 1.4 }}
          />
        </View>
      </View>
    </Modal>
  )
}

const est = StyleSheet.create({
  saludoFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4, position: 'relative' },
  avatarFoto: { width: 54, height: 54, borderRadius: 27, backgroundColor: color.borderSoft },
  saludo: { fontSize: 18, fontWeight: '800', color: color.text, letterSpacing: -0.2 },
  nombreEnt: { fontSize: 12, fontWeight: '600', color: color.text3, marginTop: 2 },
  // Beca (mascota de racha): al nivel del perfil, asomándose por detrás de la tarjeta.
  mascotaWrap: { position: 'absolute', right: -4, top: 4 },
  mascota: { width: 128, height: 100 },
  asegChip: { backgroundColor: '#fff', borderRadius: 5, borderWidth: 1, borderColor: color.borderSoft, paddingHorizontal: 5, paddingVertical: 2 },
  polAseg: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  polAsegTxt: { flex: 1, fontSize: 11.5, color: color.text2, fontWeight: '600' },

  // Tarjeta de comisión (fondo degradado navy → naranja de marca)
  // Capa de sombra aparte (la tarjeta tiene overflow:hidden y en iOS eso recorta la sombra).
  cardShadow: {
    marginTop: 28,
    borderRadius: 20,
    backgroundColor: color.primary,
    shadowColor: color.primaryDark,
    shadowOpacity: 0.42,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
  card: {
    backgroundColor: color.primary,
    borderRadius: 20,
    minHeight: 168,
    overflow: 'hidden',
  },
  cardInner: { padding: 20 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLbl: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.3 },
  cardLogo: { width: 104, height: 28 },
  cardMonto: { fontSize: 36, fontWeight: '900', color: '#fff', marginTop: 14, letterSpacing: -0.5 },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  cardStatLbl: { fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.72)' },
  skelBar: { backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 7 },
  cardStatVal: { fontSize: 14, fontWeight: '800', color: '#fff', marginTop: 3 },

  rachaAlerta: { fontSize: 11.5, fontWeight: '800', color: color.danger, marginTop: 20, lineHeight: 15 },
  accesos: { flexDirection: 'row', gap: 10, marginTop: 18 },
  acceso: {
    flex: 1,
    backgroundColor: color.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.borderSoft,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 7,
  },
  accesoIcono: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(241,89,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accesoTxt: { fontSize: 11, fontWeight: '700', color: color.text2 },
  seccion: { fontSize: 15, fontWeight: '800', color: color.text },
  verTodas: { fontSize: 12.5, fontWeight: '800', color: color.primary },
  polCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  polCliente: { fontSize: 13.5, fontWeight: '800', color: color.text },
  polFecha: { fontSize: 11, color: color.text4, marginTop: 3 },
  notaRetiro: { fontSize: 11, color: color.text3, lineHeight: 16 },
})
