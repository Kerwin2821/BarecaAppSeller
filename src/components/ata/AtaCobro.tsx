import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Alerta, Boton, Campo, Pildora, Tarjeta } from '../Ui'
import { Dropdown, type OpcionDrop } from '../Dropdown'
import { CargandoBloque } from '../Estados'
import { color } from '@/lib/tema'
import { moneda } from '@/lib/formato'
import { MONTO_REAL } from '@/lib/emisionPago'
import { ETIQUETA_PARENTESCO, type AtaWizard, type MetodoPrimeraCuota } from '@/lib/atualcance'

const METODOS: { valor: MetodoPrimeraCuota; etiqueta: string; icono: string }[] = [
  { valor: 'DEBITO_INMEDIATO', etiqueta: 'Débito', icono: '🏦' },
  { valor: 'PAGO_MOVIL', etiqueta: 'Pago Móvil', icono: '📲' },
  { valor: 'WALLET', etiqueta: 'Billetera', icono: '💰' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia', icono: '🏧' },
]

/** Paso final: contrato emitido + cobro de la cuota 1 (mismo circuito bancario que RCV). */
export function AtaCobro({ w, onNuevaVenta }: { w: AtaWizard; onNuevaVenta: () => void }) {
  const r = w.resultado
  if (!r) return null
  const bancos: OpcionDrop[] = w.bancos.map((b: any) => ({ valor: String(b.codigo).padStart(4, '0'), texto: b.nombre }))
  const monto = w.montoBsCobro
  const mm = `${Math.floor(Math.max(0, w.otpRestante) / 60)}:${String(Math.max(0, w.otpRestante) % 60).padStart(2, '0')}`

  return (
    <View style={{ gap: 12 }}>
      {/* Contrato emitido */}
      <Tarjeta style={[est.card, { borderLeftColor: color.success }]}>
        <Text style={est.ok}>✅ Contrato emitido</Text>
        <Text style={est.numero}>N° {r.numeroContrato}</Text>
        <Text style={est.hint}>Vigencia {r.vigenciaDesde} → {r.vigenciaHasta} · {r.afiliadosIncorporados} afiliado(s) · {r.cuotasGeneradas} cuotas de {moneda(r.totalCuotaUsd, '$')}</Text>
        {r.noIncorporados.length ? (
          <Alerta tipo="info">No incorporados: {r.noIncorporados.map((n) => `${ETIQUETA_PARENTESCO[n.parentesco] ?? n.parentesco} (${n.motivo})`).join(' · ')}</Alerta>
        ) : null}
        {r.avisos.map((a, k) => <Text key={k} style={[est.hint, { color: color.warning }]}>• {a}</Text>)}
      </Tarjeta>

      {/* Cobro de la cuota 1 */}
      {w.faseCobro === 'listo' ? (
        <Tarjeta style={[est.card, { borderLeftColor: color.success }]}>
          <Text style={est.ok}>💸 Cuota 1 cobrada</Text>
          {w.primeraCobrada ? <Text style={est.hint}>{moneda(w.primeraCobrada.montoBs, 'Bs.')} · tasa {w.primeraCobrada.tasa.toFixed(2)}</Text> : null}
          <Text style={est.hint}>La cobertura del afiliado queda activa. El recibo y las comisiones se generaron.</Text>
        </Tarjeta>
      ) : (
        <Tarjeta style={[est.card, { borderLeftColor: color.accent }]}>
          <Text style={est.seccion}>Cobrar la cuota 1</Text>
          {monto != null ? <Text style={est.montoBs}>{moneda(monto, 'Bs.')} <Text style={est.hint}>({moneda(w.opcionFrecuencia?.cuotaUsd ?? r.totalCuotaUsd, '$')} · tasa {(w.enlaceCobro?.tasaBcv ?? w.tasaBcv).toFixed(2)})</Text></Text> : null}
          {!MONTO_REAL ? <Text style={[est.hint, { color: color.warning }]}>En QA se cobra Bs. 1,00 (modo prueba).</Text> : null}

          {/* Cambiar método sin rehacer la venta (p. ej. el banco rechazó el OTP) */}
          {w.faseCobro === 'datos' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {METODOS.map((m) => {
                const on = w.metodoPrimeraCuota === m.valor
                return (
                  <Pressable key={m.valor} onPress={() => w.cambiarMetodoCobro(m.valor)} style={[est.metodo, on && est.metodoOn]}>
                    <Text style={[est.metodoTxt, on && { color: '#fff' }]}>{m.icono} {m.etiqueta}</Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          {/* ── BILLETERA ── */}
          {w.metodoPrimeraCuota === 'WALLET' ? (
            <View style={{ gap: 10 }}>
              <Alerta tipo={w.saldoAlcanza ? 'exito' : 'error'}>Saldo: {moneda(w.walletSaldo, 'Bs.')}. {w.saldoAlcanza ? 'Se debita al instante, sin códigos.' : 'No cubre la cuota.'}</Alerta>
              <Boton texto={w.cobrando ? 'Debitando…' : 'Pagar con mi Billetera'} variante="accent" onPress={() => void w.pagarConBilletera()} cargando={w.cobrando} disabled={!w.saldoAlcanza || w.cobrando} />
            </View>
          ) : null}

          {/* ── TRANSFERENCIA ── */}
          {w.metodoPrimeraCuota === 'TRANSFERENCIA' ? (
            <View style={{ gap: 10 }}>
              <Text style={est.hint}>El cliente transfiere a la cuenta de primas y registras el número y la fecha. Administración valida el cobro; la comisión espera esa validación.</Text>
              <Campo etiqueta="Número de la transferencia" placeholder="Referencia" value={w.referenciaPago} onChangeText={w.setReferenciaPago} />
              <Campo etiqueta="Fecha de la transferencia" placeholder="aaaa-mm-dd" value={w.fechaTransferencia} onChangeText={w.setFechaTransferencia} />
              <Boton texto={w.cobrando ? 'Registrando…' : 'Registrar pago'} variante="accent" onPress={() => void w.cobrarPrimeraCuota()} cargando={w.cobrando} disabled={w.cobrando || !w.referenciaPago.trim()} />
            </View>
          ) : null}

          {/* ── DÉBITO / PAGO MÓVIL (contra el enlace de pago) ── */}
          {w.cobroPorBanco && !w.enlaceCobro ? (
            w.cobrando ? <CargandoBloque texto="Preparando el cobro…" /> : <Boton texto="Preparar cobro" variante="accent" onPress={() => void w.cobrarPrimeraCuota()} />
          ) : null}

          {w.cobroPorBanco && w.enlaceCobro && w.faseCobro === 'datos' ? (
            <View style={{ gap: 10 }}>
              {w.metodoPrimeraCuota === 'DEBITO_INMEDIATO' ? (
                <>
                  <Text style={est.sub}>Plataforma</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {([['PLAZA', '🏛️ Banco Plaza', 'principal'], ['R4', '💳 R4', 'alterna']] as const).map(([id, t, d]) => {
                      const on = w.pasarela === id
                      return (
                        <Pressable key={id} onPress={() => w.setPasarela(id)} style={[est.metodo, { flex: 1 }, on && est.metodoOn]}>
                          <Text style={[est.metodoTxt, on && { color: '#fff' }]}>{t}</Text>
                          <Text style={[est.hint, on && { color: 'rgba(255,255,255,0.8)' }]}>{d}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                  <Dropdown etiqueta="Banco del cliente" placeholder="Selecciona el banco" opciones={bancos} valor={w.banco || null} onCambiar={w.setBanco} />
                  <Campo etiqueta="Teléfono afiliado al banco" placeholder="04141234567" keyboardType="phone-pad" value={w.telefonoPago} onChangeText={(t) => w.setTelefonoPago(t.replace(/\D/g, ''))} />
                  <Campo etiqueta="Cédula del titular de la cuenta" placeholder="12345678" keyboardType="number-pad" value={w.cedulaPago} onChangeText={w.setCedulaPago} />
                  <Boton texto={w.cobrando ? 'Solicitando…' : 'Solicitar código (OTP)'} variante="accent" onPress={() => void w.solicitarOtp()} cargando={w.cobrando} disabled={w.cobrando || !w.banco || w.telefonoPago.length < 10 || w.cedulaPago.length < 6} />
                </>
              ) : (
                <>
                  <Text style={est.hint}>Indica desde qué teléfono hará el pago móvil el cliente, para reconocerlo cuando entre.</Text>
                  <Campo etiqueta="Teléfono que paga" placeholder="04141234567" keyboardType="phone-pad" value={w.telefonoPago} onChangeText={(t) => w.setTelefonoPago(t.replace(/\D/g, ''))} />
                  {w.enlaceCobro.url ? (
                    <Pressable onPress={() => void Linking.openURL(w.enlaceCobro!.url)}><Text style={est.link}>Abrir enlace de pago del cliente ›</Text></Pressable>
                  ) : null}
                  <Boton texto={w.cobrando ? 'Registrando…' : 'Esperar el pago móvil'} variante="accent" onPress={() => void w.esperarPagoMovil()} cargando={w.cobrando} disabled={w.cobrando || w.telefonoPago.length < 10} />
                </>
              )}
            </View>
          ) : null}

          {w.faseCobro === 'otp' ? (
            <View style={{ gap: 10 }}>
              <Alerta tipo="info">El banco envió un código por SMS al teléfono del cliente. Vence en {mm}.</Alerta>
              <Campo etiqueta="Código OTP" placeholder="123456" keyboardType="number-pad" value={w.otp} onChangeText={w.setOtp} />
              <Boton texto={w.cobrando ? 'Confirmando con el banco…' : 'Confirmar débito'} variante="accent" onPress={() => void w.confirmarDebito()} cargando={w.cobrando} disabled={w.cobrando || !w.otp.trim() || w.otpRestante <= 0} />
              <Boton texto={w.otpRestante <= 0 ? 'Código vencido: pedir otro' : 'Volver'} variante="soft" onPress={w.volverADatos} disabled={w.cobrando} />
            </View>
          ) : null}

          {w.faseCobro === 'esperando' ? (
            <View style={{ gap: 10 }}>
              <CargandoBloque texto="Esperando el pago móvil del cliente…" />
              <Text style={est.hint}>Cuando el banco avise el pago entrante, la cuota queda pagada sola. Puedes esperar hasta 10 minutos.</Text>
              <Boton texto="Volver" variante="soft" onPress={w.volverADatos} />
            </View>
          ) : null}
        </Tarjeta>
      )}

      {/* Detalle del contrato */}
      {w.detalle ? (
        <Tarjeta style={{ padding: 18, gap: 10 }}>
          <Text style={est.seccion}>Contrato</Text>
          <Text style={est.hint}>Estado: <Text style={{ fontWeight: '800', color: color.text }}>{w.detalle.contrato.estado}</Text> · {w.detalle.contrato.frecuenciaPago} · {w.detalle.cuotas.length} cuotas</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {w.detalle.contrato.urlContratoPdf ? <Boton texto="📄 Contrato PDF" variante="soft" onPress={() => void Linking.openURL(w.detalle!.contrato.urlContratoPdf!)} /> : null}
            {w.detalle.contrato.urlAnexoPdf ? <Boton texto="📎 Anexo" variante="soft" onPress={() => void Linking.openURL(w.detalle!.contrato.urlAnexoPdf!)} /> : null}
          </View>
          <View style={{ gap: 6 }}>
            {w.detalle.cuotas.slice(0, 5).map((q) => (
              <View key={q.id} style={est.cuota}>
                <Text style={est.cuotaTxt}>Cuota {q.numero} · vence {q.fechaVencimiento}</Text>
                <Pildora texto={q.estado} color={q.estado === 'PAGADA' ? color.success : q.estado === 'VENCIDA' ? color.danger : color.warning} />
              </View>
            ))}
            {w.detalle.cuotas.length > 5 ? <Text style={est.hint}>… y {w.detalle.cuotas.length - 5} más. Las ves completas en Cobranza A Tu Alcance.</Text> : null}
          </View>
        </Tarjeta>
      ) : (
        <Boton texto="Ver contrato" variante="soft" onPress={() => void w.verContrato()} />
      )}

      <Boton texto="Nueva venta" variante="primary" onPress={onNuevaVenta} />
    </View>
  )
}

const est = StyleSheet.create({
  card: { padding: 18, gap: 8, borderLeftWidth: 4 },
  ok: { fontSize: 16, fontWeight: '900', color: color.success },
  numero: { fontSize: 20, fontWeight: '900', color: color.primary, letterSpacing: -0.3 },
  seccion: { fontSize: 14.5, fontWeight: '900', color: color.primary },
  sub: { fontSize: 12, fontWeight: '700', color: color.text2 },
  hint: { fontSize: 12, color: color.text3, lineHeight: 17 },
  montoBs: { fontSize: 22, fontWeight: '900', color: color.primary },
  metodo: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: color.border, backgroundColor: color.white },
  metodoOn: { backgroundColor: color.primary, borderColor: color.primary },
  metodoTxt: { fontSize: 12.5, fontWeight: '800', color: color.text2 },
  link: { fontSize: 12.5, fontWeight: '700', color: color.primary },
  cuota: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: color.borderSoft },
  cuotaTxt: { fontSize: 12, color: color.text },
})
