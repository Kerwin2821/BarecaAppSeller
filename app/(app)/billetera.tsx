import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import {
  esCreditoWallet,
  LABEL_ESTADO_WALLET,
  LABEL_MOV_WALLET,
  userApi,
  walletApi,
  type EstadoMovWallet,
  type TipoMovWallet,
  type Wallet,
  type WalletMovimiento,
} from '@/lib/endpoints'
import { desenvolver, mensajeDeError } from '@/lib/api'
import { actorUuid } from '@/lib/roles'
import { moneda } from '@/lib/formato'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { CargandoBloque, EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Boton, Campo, Pildora, Tarjeta } from '@/components/Ui'
import { Modal } from '@/components/Modal'
import { LogoBanco } from '@/components/LogoBanco'
import { useToast } from '@/components/Toast'
import { color } from '@/lib/tema'

/**
 * Mi Billetera — el saldo del vendedor y su ledger de movimientos.
 *
 * Reemplaza el manejo anterior de comisiones: cada comisión se acredita al saldo
 * (CREDITO_COMISION) y desde aquí el vendedor retira (DEBITO_RETIRO) o paga una
 * póliza con su saldo (DEBITO_PAGO_POLIZA, desde Nueva Venta). El detalle clásico
 * de comisiones por póliza queda accesible con «Ver detalle de comisiones».
 *
 * Backend: :3301 vía BFF (/api/users/wallets/v1/...), igual que el portal web.
 */

const FILTROS: { v: TipoMovWallet | ''; t: string }[] = [
  { v: '', t: 'Todos' },
  { v: 'CREDITO_COMISION', t: 'Comisiones' },
  { v: 'DEBITO_RETIRO', t: 'Retiros' },
  { v: 'DEBITO_PAGO_POLIZA', t: 'Pagos' },
]

/** Fecha ISO → dd/mm/aaaa hh:mm. */
function fechaHora(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function colorEstado(e?: EstadoMovWallet): string {
  if (e === 'CONFIRMADO') return color.success
  if (e === 'FALLIDO') return color.danger
  if (e === 'EN_REVISION') return color.amber
  return color.warning
}

export default function Billetera() {
  const { user } = useAuth()
  const router = useRouter()
  const [filtro, setFiltro] = useState<TipoMovWallet | ''>('')
  const [retiro, setRetiro] = useState(false)

  const cargar = useCallback(async () => {
    if (!user) return null
    const uuid = actorUuid(user) ?? ''
    if (!uuid) return null
    const [w, movs] = await Promise.all([
      walletApi.miWallet(user.role, uuid).catch(() => null),
      walletApi.movimientos(user.role, uuid, { size: 50 }).catch(() => null),
    ])
    const wallet = (desenvolver(w) ?? w) as Wallet | null
    const cont = (movs as any)?.content ?? (movs as any)?.data?.content ?? desenvolver(movs) ?? []
    return { wallet, movimientos: (Array.isArray(cont) ? cont : []) as WalletMovimiento[] }
  }, [user])

  const { datos, cargando, error, recargar } = useApi(cargar, [user?.loginId])
  const saldo = datos?.wallet?.saldo ?? 0
  const movimientos = datos?.movimientos ?? []
  const visibles = filtro ? movimientos.filter((m) => m.tipo === filtro) : movimientos

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla titulo="💰 Mi Billetera" detalle="Tu saldo de comisiones y tus movimientos" />

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : (
        <>
          {/* Saldo disponible */}
          {cargando && !datos ? (
            <Tarjeta style={{ padding: 20, gap: 10 }}>
              <Skeleton h={12} w={120} />
              <Skeleton h={30} w={200} />
            </Tarjeta>
          ) : (
            <Tarjeta style={est.saldoCard}>
              <Text style={est.saldoLbl}>Saldo disponible</Text>
              <Text style={est.saldoValor} numberOfLines={1} adjustsFontSizeToFit>
                {moneda(saldo)}
              </Text>
              <Text style={est.saldoHint}>
                Tus comisiones se acreditan aquí. Puedes retirarlas o pagar pólizas con este saldo.
              </Text>
            </Tarjeta>
          )}

          <Boton
            texto="Retirar saldo"
            variante="accent"
            onPress={() => setRetiro(true)}
            disabled={saldo <= 0}
            style={{ marginTop: 12 }}
          />

          <Pressable onPress={() => router.navigate('/comisiones' as never)} style={est.verDetalle} hitSlop={6}>
            <Text style={est.verDetalleTxt}>Ver detalle de comisiones por póliza ›</Text>
          </Pressable>

          {/* Movimientos */}
          <Text style={est.seccion}>Movimientos</Text>
          <View style={est.filtros}>
            {FILTROS.map((f) => {
              const on = filtro === f.v
              return (
                <Pressable key={f.v || 'todos'} onPress={() => setFiltro(f.v)} style={[est.chip, on && est.chipOn]}>
                  <Text style={[est.chipTxt, on && est.chipTxtOn]}>{f.t}</Text>
                </Pressable>
              )
            })}
          </View>

          {cargando && movimientos.length === 0 ? (
            <CargandoBloque texto="Cargando movimientos…" />
          ) : visibles.length === 0 ? (
            <Tarjeta>
              <EstadoVacio
                titulo="Sin movimientos"
                detalle="Cuando emitas una póliza, tu comisión aparecerá aquí."
              />
            </Tarjeta>
          ) : (
            <View style={{ gap: 8 }}>
              {visibles.map((m) => {
                const credito = esCreditoWallet(m.tipo)
                return (
                  <Tarjeta key={m.movimientoId} style={est.mov}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={est.movTipo} numberOfLines={1}>
                        {LABEL_MOV_WALLET[m.tipo] ?? m.tipo}
                      </Text>
                      <Text style={est.movFecha}>{fechaHora(m.fecha)}</Text>
                      {m.numeroPoliza ? <Text style={est.movRef}>Póliza N° {m.numeroPoliza}</Text> : null}
                      {m.referenciaBancaria ? <Text style={est.movRef}>Ref. {m.referenciaBancaria}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[est.movMonto, { color: credito ? color.success : color.danger }]}>
                        {credito ? '+' : '−'} {moneda(Math.abs(m.monto))}
                      </Text>
                      <Pildora color={colorEstado(m.estado)} texto={LABEL_ESTADO_WALLET[m.estado] ?? m.estado} />
                    </View>
                  </Tarjeta>
                )
              })}
            </View>
          )}
        </>
      )}

      <ModalRetiroWallet
        abierto={retiro}
        disponible={saldo}
        onCerrar={() => setRetiro(false)}
        onListo={() => {
          setRetiro(false)
          recargar()
        }}
      />
    </Pantalla>
  )
}

/** Retiro del saldo hacia un método de cobro registrado (pago móvil o cuenta bancaria). */
function ModalRetiroWallet({
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
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<any>(null)
  const [enviando, setEnviando] = useState(false)

  const cargarMetodos = useCallback(async (): Promise<any[]> => {
    if (!user || !abierto) return []
    const uuid = actorUuid(user) ?? ''
    if (!uuid) return []
    const r = await userApi.datosPagosByActor(user.role, uuid)
    return (desenvolver(r) ?? []) as any[]
  }, [user, abierto])
  const { datos: metodos, cargando } = useApi<any[]>(cargarMetodos, [user?.loginId, abierto])

  const montoNum = Number(String(monto).replace(',', '.')) || 0
  const excede = montoNum > disponible
  const valido = montoNum > 0 && !excede && !!(metodo?.datosPagosId ?? metodo?.id)

  const enviar = async () => {
    if (!user || !valido) return
    const uuid = actorUuid(user) ?? ''
    setEnviando(true)
    try {
      const r = await walletApi.retiro(user.role, uuid, {
        monto: montoNum,
        datosPagosId: String(metodo.datosPagosId ?? metodo.id),
      })
      const est = (r as any)?.estado
      avisar(
        est === 'CONFIRMADO' ? 'Retiro procesado con éxito.' : 'Retiro solicitado. Queda en proceso.',
        'ok',
      )
      setMonto('')
      onListo()
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Retirar saldo" subtitulo={`Disponible: ${moneda(disponible)}`}>
      <View style={{ gap: 14 }}>
        <Campo
          etiqueta="Monto a retirar (Bs.)"
          placeholder="0,00"
          keyboardType="decimal-pad"
          value={monto}
          error={excede}
          onChangeText={setMonto}
        />
        {excede ? <Text style={est.errorTxt}>El monto supera tu saldo disponible.</Text> : null}

        <View style={{ gap: 8 }}>
          <Text style={est.label}>Método de cobro</Text>
          {cargando ? (
            <CargandoBloque texto="Cargando métodos…" />
          ) : !metodos?.length ? (
            <Text style={est.hint}>
              No tienes métodos de cobro registrados. Agrégalos desde Mi Perfil → Métodos de Cobro.
            </Text>
          ) : (
            metodos.map((p: any, i: number) => {
              const id = p?.datosPagosId ?? p?.id ?? i
              const sel = (metodo?.datosPagosId ?? metodo?.id) === (p?.datosPagosId ?? p?.id)
              const esCuenta = (p?.tipoMetodo ?? '').toUpperCase() === 'TRANSFERENCIA' || !!p?.numeroCuenta
              return (
                <Pressable key={String(id)} onPress={() => setMetodo(p)} style={[est.metodo, sel && est.metodoOn]}>
                  <LogoBanco codigo={p?.banco} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={est.metodoAlias} numberOfLines={1}>
                      {p?.alias || (esCuenta ? 'Cuenta bancaria' : 'Pago móvil')}
                    </Text>
                    <Text style={est.metodoDet} numberOfLines={1}>
                      {esCuenta
                        ? `Cuenta ${String(p?.numeroCuenta ?? '').slice(-4).padStart(8, '•')}`
                        : `${p?.telefono ?? ''}`}
                    </Text>
                  </View>
                  {sel ? <Text style={{ color: color.accent, fontWeight: '900' }}>✓</Text> : null}
                </Pressable>
              )
            })
          )}
        </View>

        <Boton
          texto={enviando ? 'Procesando…' : 'Solicitar retiro'}
          variante="accent"
          onPress={enviar}
          cargando={enviando}
          disabled={!valido || enviando}
        />
      </View>
    </Modal>
  )
}

const est = StyleSheet.create({
  saldoCard: { padding: 20, gap: 6, borderLeftWidth: 4, borderLeftColor: color.accent },
  saldoLbl: { fontSize: 12, fontWeight: '700', color: color.text3, letterSpacing: 0.3 },
  saldoValor: { fontSize: 32, fontWeight: '900', color: color.primary, letterSpacing: -0.8 },
  saldoHint: { fontSize: 11.5, color: color.text3, lineHeight: 16, marginTop: 2 },
  verDetalle: { alignSelf: 'center', marginTop: 12, paddingVertical: 6 },
  verDetalleTxt: { fontSize: 12.5, fontWeight: '700', color: color.primary },
  seccion: { fontSize: 15, fontWeight: '900', color: color.text, marginTop: 20, marginBottom: 8 },
  filtros: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.border,
  },
  chipOn: { backgroundColor: color.primary, borderColor: color.primary },
  chipTxt: { fontSize: 12, fontWeight: '700', color: color.text2 },
  chipTxtOn: { color: '#fff' },
  mov: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  movTipo: { fontSize: 13.5, fontWeight: '800', color: color.text },
  movFecha: { fontSize: 11.5, color: color.text3, marginTop: 2 },
  movRef: { fontSize: 11, color: color.text4, marginTop: 1 },
  movMonto: { fontSize: 14.5, fontWeight: '900' },
  label: { fontSize: 12.5, fontWeight: '700', color: color.text2 },
  hint: { fontSize: 12, color: color.text3, lineHeight: 17 },
  errorTxt: { fontSize: 11.5, color: color.danger, fontWeight: '600' },
  metodo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.white,
  },
  metodoOn: { borderColor: color.accent, backgroundColor: color.primaryTint },
  metodoAlias: { fontSize: 13, fontWeight: '800', color: color.text },
  metodoDet: { fontSize: 11.5, color: color.text3, marginTop: 1 },
})
