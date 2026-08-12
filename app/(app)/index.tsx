import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg'
import { useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { authApi, comisionApi, rachasApi, userApi } from '@/lib/endpoints'
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
import { VisitaGuiada } from '@/components/VisitaGuiada'
import { registrarPush } from '@/lib/push'
import { marcarTourVisto, tourVisto } from '@/lib/onboarding'
import { color } from '@/lib/tema'

// Marca + mascota + logos de aseguradora — empaquetados en el app.
// Versión blanca (fondo transparente) para integrarla sobre la tarjeta de color.
const LOGO_BARECA_BLANCO = require('../../assets/logo-bareca-blanco.png')
const CARA_TRISTE = require('../../assets/racha-triste.png')
const CARA_FELIZ = require('../../assets/racha-feliz.png')
const LOGOS_ASEG: { re: RegExp; src: number }[] = [
  { re: /caroni/i, src: require('../../assets/logos/logo-caroni-blanco.png') },
  { re: /estar/i, src: require('../../assets/logos/logo-estar-seguros.png') },
  { re: /occidental/i, src: require('../../assets/logos/logo-laoccidental.png') },
]
function LogoAseg({ nombre }: { nombre?: string }) {
  const logo = LOGOS_ASEG.find((l) => l.re.test(nombre || ''))
  if (!logo) return null
  return (
    <View style={est.asegChip}>
      <Image source={logo.src} resizeMode="contain" style={{ height: 14, width: 60 }} />
    </View>
  )
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

  // Visita guiada la primera vez que se entra al app.
  const [tour, setTour] = useState(false)
  useEffect(() => {
    tourVisto().then((v) => {
      if (!v) setTour(true)
    })
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
    const [tot, res, pol, ent, foto] = await Promise.all([
      uuid ? comisionApi.totales(user.role, uuid).then((r) => desenvolver(r) as any).catch(() => null) : Promise.resolve(null),
      uuid ? rachasApi.resumen(user.role, uuid).then((r: any) => r?.data ?? null).catch(() => null) : Promise.resolve(null),
      fetchPolizas(user, 'vehicle', 0, 5).then((r) => r.items).catch(() => [] as DisplayPolicy[]),
      entidadPromesa.then((e: any) => e?.nombre ?? null).catch(() => null),
      authApi.obtenerFoto(user.loginId).then((r: any) => r?.data?.url ?? null).catch(() => null),
    ])
    return { tot, res, pol, nombreEnt: ent, foto }
  }, [user])
  const { datos, cargando, error, recargar } = useApi(cargar, [user?.loginId])

  const tot = datos?.tot
  const pendiente = tot?.totalPendiente ?? tot?.pendiente ?? tot?.montoPendiente ?? 0
  const pagada = tot?.totalPagada ?? tot?.pagado ?? 0
  const historico = tot?.totalHistorico ?? tot?.total ?? 0
  const res = datos?.res
  const cumpliendo = res ? res.estado === 'feliz' || res.hoyVendio === true : null
  const polizas: DisplayPolicy[] = datos?.pol ?? []
  const foto = datos?.foto ?? null
  const nombre = datos?.nombreEnt || `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Vendedor'

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
            <Skeleton w="100%" h={196} r={20} />
          ) : (
            <>
              <Pressable style={est.cardShadow} onPress={() => router.navigate('/comisiones' as never)}>
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
                      <Text style={est.cardLbl}>Comisión acumulada</Text>
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
              <Boton texto="Retirar comisión" variante="accent" onPress={() => setRetiro(true)} style={{ marginTop: 16 }} />
            </>
          )}

          {/* Banner de aseguradoras (debajo de Retirar comisión) */}
          <BannerAseguradoras />

          {/* Accesos rápidos */}
          <View style={est.accesos}>
            <Acceso Icono={IcoReporte} texto="Reporte" onPress={() => router.navigate('/reporte' as never)} />
            <Acceso Icono={IcoRachas} texto="Rachas" onPress={() => router.navigate('/rachas' as never)} />
            <Acceso Icono={IcoEquipo} texto="Equipo" onPress={() => router.navigate('/equipo' as never)} />
            <Acceso Icono={IcoSoporte} texto="Soporte" onPress={() => router.navigate('/soporte' as never)} />
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

      <VisitaGuiada
        visible={tour}
        onFinalizar={() => {
          setTour(false)
          void marcarTourVisto()
        }}
      />
    </Pantalla>
  )
}

function Acceso({
  Icono,
  texto,
  onPress,
}: {
  Icono: ComponentType<{ color: string; size?: number }>
  texto: string
  onPress: () => void
}) {
  return (
    <Pressable style={est.acceso} onPress={onPress}>
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
    marginTop: -2,
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
