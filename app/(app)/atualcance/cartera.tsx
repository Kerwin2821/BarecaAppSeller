import { useCallback, useState } from 'react'
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { atualcanceApi, walletApi, type AtaCuota, type AtaDetalleContrato, type AtaLineaCartera } from '@/lib/endpoints'
import { mensajeDeError } from '@/lib/api'
import { actorUuid } from '@/lib/roles'
import { moneda } from '@/lib/formato'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { CargandoBloque, EstadoError, EstadoVacio } from '@/components/Estados'
import { Alerta, Boton, Campo, Pildora, Tarjeta } from '@/components/Ui'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { color } from '@/lib/tema'

/**
 * Cartera de A TU ALCANCE: los contratos del vendedor con su estado de cobranza, y el
 * cobro de cada cuota (billetera, registro manual o enlace de pago al cliente).
 * Las cuotas por débito/pago móvil se cobran desde el enlace que recibe el cliente —
 * el mismo circuito bancario de la página pública — así hay un solo sitio de registro.
 */

const ESTADO_COLOR: Record<string, string> = { VIGENTE: color.success, SUSPENDIDO: color.warning, ANULADO: color.danger, PENDIENTE_PAGO: color.warning }
const ESTADO_CUOTA_COLOR: Record<string, string> = { PAGADA: color.success, VENCIDA: color.danger, EN_MORA: color.danger, PENDIENTE: color.warning, ANULADA: color.text4 }
const fechaCorta = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')

export default function AtaCartera() {
  const { user } = useAuth()
  const { avisar } = useToast()
  const [filtro, setFiltro] = useState<'' | 'VIGENTE' | 'SUSPENDIDO' | 'ANULADO'>('')
  const [sel, setSel] = useState<AtaLineaCartera | null>(null)
  const [detalle, setDetalle] = useState<AtaDetalleContrato | null>(null)
  const [cargandoDet, setCargandoDet] = useState(false)
  const [cuotaSel, setCuotaSel] = useState<AtaCuota | null>(null)
  const [metodo, setMetodo] = useState<'WALLET' | 'EFECTIVO' | 'TRANSFERENCIA' | 'ENLACE'>('ENLACE')
  const [referencia, setReferencia] = useState('')
  const [fechaTransf, setFechaTransf] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [saldo, setSaldo] = useState<number | null>(null)

  const cargar = useCallback(async (): Promise<AtaLineaCartera[]> => {
    if (!user) return []
    const uuid = actorUuid(user) ?? ''
    if (!uuid) return []
    const lista = await atualcanceApi.cartera(user.role, uuid, filtro || undefined)
    return Array.isArray(lista) ? lista : ((lista as any)?.data ?? [])
  }, [user, filtro])
  const { datos, cargando, error, recargar } = useApi<AtaLineaCartera[]>(cargar, [user?.loginId, filtro])
  const lineas = datos ?? []

  const abrir = async (l: AtaLineaCartera) => {
    setSel(l); setDetalle(null); setCuotaSel(null); setCargandoDet(true)
    try {
      const d = await atualcanceApi.consultar(l.numeroContrato)
      setDetalle(d)
      const uuid = actorUuid(user!) ?? ''
      if (uuid) walletApi.miWallet(user!.role, uuid).then((w: any) => setSaldo(Number(w?.saldo ?? w?.data?.saldo ?? 0) || 0)).catch(() => setSaldo(null))
    } catch (e) { avisar(mensajeDeError(e), 'error') }
    finally { setCargandoDet(false) }
  }
  const cerrar = () => { setSel(null); setDetalle(null); setCuotaSel(null); setReferencia(''); setFechaTransf('') }

  const cobrar = async () => {
    if (!sel || !cuotaSel || procesando || !user) return
    setProcesando(true)
    try {
      if (metodo === 'ENLACE') {
        const e = await atualcanceApi.enviarEnlacePago(sel.numeroContrato, cuotaSel.numero, true)
        avisar('Enlace enviado al cliente.', 'ok')
        await Share.share({ message: `Bareca · A Tu Alcance\nCuota ${cuotaSel.numero} de tu plan: ${moneda(e.montoBs, 'Bs.')}\nPaga aquí: ${e.url}` })
      } else if (metodo === 'WALLET') {
        const uuid = actorUuid(user) ?? ''
        const p = await atualcanceApi.pagarCuotaConBilletera(sel.numeroContrato, cuotaSel.numero, user.role, uuid)
        avisar(`Cuota ${p.cuotaNumero} pagada con tu billetera (${moneda(p.montoBs, 'Bs.')}).${p.rehabilitado ? ' Contrato rehabilitado.' : ''}`, 'ok')
      } else {
        if (metodo === 'TRANSFERENCIA' && !referencia.trim()) { avisar('Escribe la referencia de la transferencia.', 'error'); setProcesando(false); return }
        const p = await atualcanceApi.registrarPago(sel.numeroContrato, {
          numeroCuota: cuotaSel.numero, metodoPago: metodo, referencia: referencia.trim() || null,
          fechaTransferencia: fechaTransf || null, registradaPor: user.email ?? 'vendedor',
        })
        avisar(`Cuota ${p.cuotaNumero} registrada (${moneda(p.montoBs, 'Bs.')}).${p.rehabilitado ? ' Contrato rehabilitado.' : ''}`, 'ok')
      }
      setCuotaSel(null); setReferencia('')
      const d = await atualcanceApi.consultar(sel.numeroContrato); setDetalle(d)
      recargar()
    } catch (e) { avisar(mensajeDeError(e), 'error') }
    finally { setProcesando(false) }
  }

  const c = detalle?.contrato
  const pendientes = detalle?.cuotas.filter((q) => q.estado !== 'PAGADA' && q.estado !== 'ANULADA') ?? []
  const montoBsCuota = cuotaSel ? (cuotaSel.montoBs ?? null) : null

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla titulo="💚 Cobranza A Tu Alcance" detalle="Tus contratos y el cobro de cada cuota" />

      <View style={est.filtros}>
        {([['', 'Todos'], ['VIGENTE', 'Vigentes'], ['SUSPENDIDO', 'Suspendidos'], ['ANULADO', 'Anulados']] as const).map(([v, t]) => (
          <Pressable key={v} onPress={() => setFiltro(v)} style={[est.chip, filtro === v && est.chipOn]}>
            <Text style={[est.chipTxt, filtro === v && { color: '#fff' }]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <EstadoError mensaje={error} onReintentar={recargar} /> : cargando && !datos ? <CargandoBloque texto="Cargando cartera…" /> : lineas.length === 0 ? (
        <Tarjeta><EstadoVacio titulo="Sin contratos" detalle="Cuando emitas un contrato de A Tu Alcance aparecerá aquí con su cobranza." /></Tarjeta>
      ) : (
        <View style={{ gap: 10 }}>
          {lineas.map((l) => (
            <Pressable key={l.numeroContrato} onPress={() => void abrir(l)}>
              <Tarjeta style={[est.linea, l.cuotasVencidas > 0 && { borderLeftColor: color.danger }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={est.titular} numberOfLines={1}>{l.titular || 'Sin titular'}</Text>
                    <Text style={est.sub}>N° {l.numeroContrato} · {l.documentoTitular || '—'}</Text>
                  </View>
                  <Pildora texto={l.estado} color={ESTADO_COLOR[l.estado] ?? color.text3} />
                </View>
                <View style={est.kpis}>
                  <Kpi k="Pagadas" v={String(l.cuotasPagadas)} c={color.success} />
                  <Kpi k="Vencidas" v={String(l.cuotasVencidas)} c={l.cuotasVencidas ? color.danger : color.text3} />
                  <Kpi k="Pendientes" v={String(l.cuotasPendientes)} c={color.text2} />
                  <Kpi k="Deuda" v={moneda(l.deudaUsd, '$')} c={l.deudaUsd > 0 ? color.danger : color.text3} />
                </View>
                {l.proximaCuota ? <Text style={est.prox}>Próxima: cuota {l.proximaCuota} · vence {fechaCorta(l.proximoVencimiento)} · {moneda(l.proximoMontoUsd ?? l.totalCuotaUsd, '$')}</Text> : null}
              </Tarjeta>
            </Pressable>
          ))}
        </View>
      )}

      {/* Detalle + cobro */}
      <Modal abierto={!!sel} onCerrar={cerrar} titulo={sel ? `Contrato ${sel.numeroContrato}` : ''} subtitulo={sel?.titular ?? undefined}>
        {cargandoDet || !detalle ? <CargandoBloque texto="Cargando contrato…" /> : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Pildora texto={c!.estado} color={ESTADO_COLOR[c!.estado] ?? color.text3} />
              <Pildora texto={c!.frecuenciaPago} color={color.primary} />
              <Pildora texto={c!.modalidadCobro === 'VENDEDOR_COBRA' ? 'Cobra el vendedor' : 'Aviso al cliente'} color={color.text3} />
            </View>
            <Text style={est.sub}>Vigencia {fechaCorta(c!.vigenciaDesde)} → {fechaCorta(c!.vigenciaHasta)} · {detalle.plan?.nombre ?? ''} · {detalle.afiliados.length} afiliado(s)</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {c!.urlContratoPdf ? <Boton texto="📄 Contrato" variante="mini" onPress={() => void Linking.openURL(c!.urlContratoPdf!)} /> : null}
              {c!.urlAnexoPdf ? <Boton texto="📎 Anexo" variante="mini" onPress={() => void Linking.openURL(c!.urlAnexoPdf!)} /> : null}
              {c!.clienteTelefono ? <Boton texto="📲 WhatsApp" variante="mini" onPress={() => void Linking.openURL(`https://wa.me/${c!.clienteTelefono!.replace(/\D/g, '').replace(/^0/, '58')}`)} /> : null}
            </View>

            {!cuotaSel ? (
              <View style={{ gap: 6 }}>
                <Text style={est.seccion}>Cuotas</Text>
                {detalle.cuotas.map((q) => {
                  const cobrable = q.estado !== 'PAGADA' && q.estado !== 'ANULADA'
                  return (
                    <Pressable key={q.id} disabled={!cobrable} onPress={() => { setCuotaSel(q); setMetodo(c!.modalidadCobro === 'VENDEDOR_COBRA' ? 'EFECTIVO' : 'ENLACE') }} style={est.cuota}>
                      <View style={{ flex: 1 }}>
                        <Text style={est.cuotaTit}>Cuota {q.numero} · {moneda(q.montoUsd, '$')}{q.montoBs ? ` · ${moneda(q.montoBs, 'Bs.')}` : ''}</Text>
                        <Text style={est.sub}>Vence {fechaCorta(q.fechaVencimiento)}{q.metodoPago ? ` · ${q.metodoPago}` : ''}{q.referencia ? ` · ref. ${q.referencia}` : ''}</Text>
                      </View>
                      {q.urlRecibo ? <Pressable onPress={() => void Linking.openURL(q.urlRecibo!)} hitSlop={6}><Text style={{ fontSize: 16 }}>🧾</Text></Pressable> : null}
                      <Pildora texto={q.estado} color={ESTADO_CUOTA_COLOR[q.estado] ?? color.text3} />
                      {cobrable ? <Text style={{ color: color.accent, fontWeight: '900' }}>›</Text> : null}
                    </Pressable>
                  )
                })}
                {pendientes.length === 0 ? <Alerta tipo="exito">Todas las cuotas están pagadas.</Alerta> : null}
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <Text style={est.seccion}>Cobrar cuota {cuotaSel.numero} · {moneda(cuotaSel.montoUsd, '$')}{montoBsCuota ? ` (${moneda(montoBsCuota, 'Bs.')})` : ''}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {([['ENLACE', '🔗 Enviar link de pago'], ['WALLET', '💰 Mi Billetera'], ['EFECTIVO', '💵 Efectivo'], ['TRANSFERENCIA', '🏧 Transferencia']] as const).map(([v, t]) => (
                    <Pressable key={v} onPress={() => setMetodo(v)} style={[est.metodo, metodo === v && est.metodoOn]}>
                      <Text style={[est.metodoTxt, metodo === v && { color: '#fff' }]}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
                {metodo === 'ENLACE' ? <Text style={est.sub}>Se genera el enlace de esta cuota y se le envía al cliente (correo/WhatsApp). Él paga por débito o pago móvil; la cuota queda pagada sola.</Text> : null}
                {metodo === 'WALLET' ? <Alerta tipo={saldo != null && montoBsCuota != null && saldo >= montoBsCuota ? 'exito' : 'info'}>Saldo en billetera: {saldo != null ? moneda(saldo, 'Bs.') : '—'}. Se debita al instante.</Alerta> : null}
                {metodo === 'EFECTIVO' ? <Text style={est.sub}>Registras que cobraste en efectivo. Administración valida el cobro; la comisión espera esa validación.</Text> : null}
                {metodo === 'TRANSFERENCIA' ? (
                  <>
                    <Campo etiqueta="Número de la transferencia" placeholder="Referencia" value={referencia} onChangeText={setReferencia} />
                    <Campo etiqueta="Fecha de la transferencia" placeholder="aaaa-mm-dd" value={fechaTransf} onChangeText={setFechaTransf} />
                  </>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Boton texto="Volver" variante="soft" onPress={() => setCuotaSel(null)} style={{ flex: 1 }} disabled={procesando} />
                  <Boton texto={procesando ? 'Procesando…' : metodo === 'ENLACE' ? 'Enviar enlace' : 'Confirmar cobro'} variante="accent" onPress={() => void cobrar()} cargando={procesando} disabled={procesando} style={{ flex: 1.5 }} />
                </View>
              </View>
            )}
          </View>
        )}
      </Modal>
    </Pantalla>
  )
}

function Kpi({ k, v, c }: { k: string; v: string; c: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 15, fontWeight: '900', color: c }}>{v}</Text>
      <Text style={{ fontSize: 10.5, color: color.text3, fontWeight: '600' }}>{k}</Text>
    </View>
  )
}

const est = StyleSheet.create({
  filtros: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  chipOn: { backgroundColor: color.primary, borderColor: color.primary },
  chipTxt: { fontSize: 12, fontWeight: '700', color: color.text2 },
  linea: { padding: 14, gap: 10, borderLeftWidth: 4, borderLeftColor: color.success },
  titular: { fontSize: 14, fontWeight: '800', color: color.text },
  sub: { fontSize: 11.5, color: color.text3, marginTop: 2, lineHeight: 16 },
  kpis: { flexDirection: 'row', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: color.borderSoft },
  prox: { fontSize: 11.5, color: color.primary, fontWeight: '700' },
  seccion: { fontSize: 13.5, fontWeight: '900', color: color.primary },
  cuota: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.borderSoft },
  cuotaTit: { fontSize: 12.5, fontWeight: '700', color: color.text },
  metodo: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: color.border, backgroundColor: color.white },
  metodoOn: { backgroundColor: color.primary, borderColor: color.primary },
  metodoTxt: { fontSize: 12, fontWeight: '800', color: color.text2 },
})
