import { useCallback, useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { comisionApi, rachasApi, userApi } from '@/lib/endpoints'
import { desenvolver, mensajeDeError } from '@/lib/api'
import { fetchPolizas } from '@/lib/polizas'
import { actorUuid, etiquetaRol } from '@/lib/roles'
import { fechaCorta, moneda } from '@/lib/formato'
import { bancoInfo } from '@/lib/bancos'
import type { DisplayPolicy } from '@/lib/tipos'
import { Pantalla } from '@/components/Pantalla'
import { CargandoBloque, EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Alerta, Boton, Chip, Pildora, Tarjeta } from '@/components/Ui'
import { Modal } from '@/components/Modal'
import { Dropdown, type OpcionDrop } from '@/components/Dropdown'
import { BannerAseguradoras } from '@/components/BannerAseguradoras'
import { useToast } from '@/components/Toast'
import { color } from '@/lib/tema'

const NARANJA = '#F97316'

// Mascota (racha en riesgo) y logos de aseguradora — empaquetados en el app.
const CARA_TRISTE = require('../../assets/racha-triste.png')
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

export default function Home() {
  const router = useRouter()
  const { user } = useAuth()
  const [retiro, setRetiro] = useState(false)

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
    const [tot, res, pol, ent] = await Promise.all([
      uuid ? comisionApi.totales(user.role, uuid).then((r) => desenvolver(r) as any).catch(() => null) : Promise.resolve(null),
      uuid ? rachasApi.resumen(user.role, uuid).then((r: any) => r?.data ?? null).catch(() => null) : Promise.resolve(null),
      fetchPolizas(user, 'vehicle', 0, 5).then((r) => r.items).catch(() => [] as DisplayPolicy[]),
      entidadPromesa.then((e: any) => e?.nombre ?? null).catch(() => null),
    ])
    return { tot, res, pol, nombreEnt: ent }
  }, [user])
  const { datos, cargando, error, recargar } = useApi(cargar, [user?.loginId])

  const tot = datos?.tot
  const pendiente = tot?.totalPendiente ?? tot?.pendiente ?? tot?.montoPendiente ?? 0
  const pagada = tot?.totalPagada ?? tot?.pagado ?? 0
  const historico = tot?.totalHistorico ?? tot?.total ?? 0
  const res = datos?.res
  const cumpliendo = res ? res.estado === 'feliz' || res.hoyVendio === true : null
  const polizas: DisplayPolicy[] = datos?.pol ?? []
  const nombre = datos?.nombreEnt || `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Vendedor'

  return (
    <Pantalla onRefresh={recargar}>
      {/* Saludo + carita de meta */}
      <View style={est.saludoFila}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={est.saludo} numberOfLines={2}>
            Hola, {nombre} 👋
          </Text>
          <Text style={est.rol}>{etiquetaRol(user?.role)}</Text>
        </View>
        {res ? (
          <View style={est.metaBox}>
            {cumpliendo ? (
              <Text style={est.cara}>😄</Text>
            ) : (
              <Image source={CARA_TRISTE} resizeMode="contain" style={est.caraImg} />
            )}
            <Text style={[est.metaTxt, { color: cumpliendo ? color.success : color.danger }]}>
              {cumpliendo ? 'Meta al día' : 'Meta en riesgo'}
            </Text>
          </View>
        ) : null}
      </View>

      {error && !tot ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : (
        <>
          {/* Wallet: comisión acumulada */}
          {cargando && !tot ? (
            <Skeleton w="100%" h={168} r={20} />
          ) : (
            <View style={est.wallet}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={est.walletLbl}>Comisión acumulada</Text>
                <Text style={est.walletMoneda}>Bs.</Text>
              </View>
              <Text style={est.walletMonto} numberOfLines={1} adjustsFontSizeToFit>
                {moneda(pendiente).replace('Bs. ', '')}
              </Text>
              <View style={est.walletSub}>
                <View>
                  <Text style={est.walletSubLbl}>Pagado</Text>
                  <Text style={est.walletSubVal}>{moneda(pagada)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={est.walletSubLbl}>Histórico</Text>
                  <Text style={est.walletSubVal}>{moneda(historico)}</Text>
                </View>
              </View>
              <Pressable style={est.retirarBtn} onPress={() => setRetiro(true)}>
                <Text style={est.retirarTxt}>Retirar comisión</Text>
              </Pressable>
            </View>
          )}

          {res?.mensaje ? (
            <Text style={[est.mensajeMeta, !cumpliendo && { color: color.danger }]}>{String(res.mensaje)}</Text>
          ) : null}

          {/* Accesos rápidos */}
          <View style={est.accesos}>
            <Acceso emoji="🧾" texto="Reporte" onPress={() => router.navigate('/reporte' as never)} />
            <Acceso emoji="🔥" texto="Rachas" onPress={() => router.navigate('/rachas' as never)} />
            <Acceso emoji="👥" texto="Equipo" onPress={() => router.navigate('/equipo' as never)} />
            <Acceso emoji="💬" texto="Soporte" onPress={() => router.navigate('/soporte' as never)} />
          </View>

          <BannerAseguradoras />

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

function Acceso({ emoji, texto, onPress }: { emoji: string; texto: string; onPress: () => void }) {
  return (
    <Pressable style={est.acceso} onPress={onPress}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
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
  saludoFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  saludo: { fontSize: 20, fontWeight: '800', color: color.text, letterSpacing: -0.3 },
  rol: { fontSize: 12.5, color: color.text2, marginTop: 2 },
  metaBox: { alignItems: 'center' },
  cara: { fontSize: 30 },
  caraImg: { width: 54, height: 42 },
  asegChip: { backgroundColor: '#fff', borderRadius: 5, borderWidth: 1, borderColor: color.borderSoft, paddingHorizontal: 5, paddingVertical: 2 },
  polAseg: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  polAsegTxt: { flex: 1, fontSize: 11.5, color: color.text2, fontWeight: '600' },
  metaTxt: { fontSize: 10.5, fontWeight: '800', marginTop: 1 },
  wallet: {
    backgroundColor: color.primary,
    borderRadius: 20,
    padding: 20,
    shadowColor: color.primary,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  walletLbl: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.3 },
  walletMoneda: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.7)' },
  walletMonto: { fontSize: 40, fontWeight: '900', color: '#fff', marginTop: 6, letterSpacing: -1 },
  walletSub: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  walletSubLbl: { fontSize: 10.5, color: 'rgba(255,255,255,0.7)', fontWeight: '700' },
  walletSubVal: { fontSize: 13, color: '#fff', fontWeight: '800', marginTop: 2 },
  retirarBtn: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  retirarTxt: { fontSize: 13.5, fontWeight: '800', color: color.primaryDark },
  mensajeMeta: { fontSize: 12.5, color: color.text2, marginTop: 12, textAlign: 'center', fontWeight: '600' },
  accesos: { flexDirection: 'row', gap: 10, marginTop: 18 },
  acceso: {
    flex: 1,
    backgroundColor: color.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.borderSoft,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  accesoTxt: { fontSize: 11, fontWeight: '700', color: color.text2 },
  seccion: { fontSize: 15, fontWeight: '800', color: color.text },
  verTodas: { fontSize: 12.5, fontWeight: '800', color: color.primary },
  polCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  polCliente: { fontSize: 13.5, fontWeight: '800', color: color.text },
  polSub: { fontSize: 11.5, color: color.text2, marginTop: 2 },
  polFecha: { fontSize: 11, color: color.text4, marginTop: 3 },
  notaRetiro: { fontSize: 11, color: color.text3, lineHeight: 16 },
})
