import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Alerta, Boton, Campo, Tarjeta } from '../Ui'
import { color } from '@/lib/tema'
import { moneda } from '@/lib/formato'
import { ETIQUETA_PARENTESCO, type AtaWizard, type MetodoPrimeraCuota } from '@/lib/atualcance'
import type { AtaFrecuencia } from '@/lib/endpoints'

const METODOS: { valor: MetodoPrimeraCuota; etiqueta: string; icono: string }[] = [
  { valor: 'DEBITO_INMEDIATO', etiqueta: 'Débito Inmediato', icono: '🏦' },
  { valor: 'PAGO_MOVIL', etiqueta: 'Pago Móvil', icono: '📲' },
  { valor: 'WALLET', etiqueta: 'Mi Billetera', icono: '💰' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia', icono: '🏧' },
]

/** Paso 3: resumen del contrato, forma de cobro y emisión. */
export function AtaResumen({ w }: { w: AtaWizard }) {
  const cot = w.cotizacion
  const nombre = (p?: { nombres?: string; apellidos?: string; razonSocial?: string } | null) =>
    p?.razonSocial || [p?.nombres, p?.apellidos].filter(Boolean).join(' ') || '—'

  return (
    <View style={{ gap: 12 }}>
      <Tarjeta style={{ padding: 18, gap: 10 }}>
        <Text style={est.seccion}>Resumen del contrato</Text>
        <Fila k="Plan" v={w.plan?.nombre ?? '—'} />
        <Fila k="Contratante" v={nombre(w.contratante)} />
        <Fila k="Titular" v={nombre(w.titular?.persona)} />
        <Fila k="Afiliados" v={`${w.lineasElegibles.length} (${w.integrantes.map((i) => ETIQUETA_PARENTESCO[i.parentesco]).join(', ')})`} />
        {w.lineasRechazadas.length ? (
          <Alerta tipo="error">
            No entran al contrato: {w.lineasRechazadas.map((l) => `${ETIQUETA_PARENTESCO[l.parentesco]} (${l.motivo || 'no admisible'})`).join(' · ')}
          </Alerta>
        ) : null}
        <Fila k="Recaudos cargados" v={String(w.documentos.length)} />
      </Tarjeta>

      {cot ? (
        <Tarjeta style={{ padding: 18, gap: 12 }}>
          <Text style={est.seccion}>Frecuencia de pago</Text>
          <Text style={est.hint}>El total del año es el mismo en todas; cambia cuántos cobros son y de cuánto es cada uno.</Text>
          <View style={{ gap: 8 }}>
            {(cot.frecuencias?.length ? cot.frecuencias : [{ codigo: 'SEMANAL' as AtaFrecuencia, etiqueta: 'Semanal', cobros: cot.semanas, cuotaUsd: cot.totalSemanalUsd }]).map((f) => {
              const on = w.frecuenciaPago === f.codigo
              return (
                <Pressable key={f.codigo} onPress={() => w.setFrecuenciaPago(f.codigo)} style={[est.opcion, on && est.opcionOn]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[est.opcTit, on && { color: '#fff' }]}>{f.etiqueta}</Text>
                    <Text style={[est.opcDet, on && { color: 'rgba(255,255,255,0.85)' }]}>{f.cobros} cobros de {moneda(f.cuotaUsd, '$')}</Text>
                  </View>
                  <Text style={[est.opcMonto, on && { color: '#fff' }]}>{moneda(f.cuotaUsd, '$')}</Text>
                </Pressable>
              )
            })}
          </View>
          <View style={est.totalBox}>
            <Text style={est.totalLbl}>Total anual</Text>
            <Text style={est.totalVal}>{moneda(cot.totalAnualUsd, '$')}</Text>
            {w.opcionFrecuencia && w.tasaBcv > 0 ? (
              <Text style={est.hint}>Cuota {w.opcionFrecuencia.etiqueta.toLowerCase()} ≈ {moneda(Math.round(w.opcionFrecuencia.cuotaUsd * w.tasaBcv * 100) / 100, 'Bs.')} a la tasa BCV de hoy ({w.tasaBcv.toFixed(2)})</Text>
            ) : null}
          </View>
        </Tarjeta>
      ) : null}

      <Tarjeta style={{ padding: 18, gap: 12 }}>
        <Text style={est.seccion}>Modalidad de cobranza</Text>
        <View style={{ gap: 8 }}>
          {([['AVISO_CLIENTE', 'Aviso al cliente', 'El sistema envía el aviso con link de pago; el cliente paga por pago móvil o débito.'], ['VENDEDOR_COBRA', 'El vendedor cobra', 'Tú cobras y registras el pago en el app.']] as const).map(([v, t, d]) => {
            const on = w.modalidadCobro === v
            return (
              <Pressable key={v} onPress={() => w.setModalidadCobro(v)} style={[est.opcion, on && est.opcionOn]}>
                <View style={{ flex: 1 }}>
                  <Text style={[est.opcTit, on && { color: '#fff' }]}>{t}</Text>
                  <Text style={[est.opcDet, on && { color: 'rgba(255,255,255,0.85)' }]}>{d}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      </Tarjeta>

      <Tarjeta style={{ padding: 18, gap: 12 }}>
        <Text style={est.seccion}>Cómo se cobra la primera cuota</Text>
        <Text style={est.hint}>La cobertura arranca con la cuota 1 pagada. Se cobra en cuanto se emite el contrato.</Text>
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
        {w.metodoPrimeraCuota === 'WALLET' ? (
          <Alerta tipo={w.saldoAlcanza ? 'exito' : 'error'}>
            Saldo en billetera: {moneda(w.walletSaldo, 'Bs.')}. {w.saldoAlcanza ? 'Alcanza para la cuota 1.' : 'No cubre la cuota 1: elige otro método.'}
          </Alerta>
        ) : null}
      </Tarjeta>

      <Tarjeta style={{ padding: 18, gap: 10 }}>
        <Text style={est.seccion}>Observaciones (opcional)</Text>
        <Campo placeholder="Notas para administración" value={w.observaciones} onChangeText={w.setObservaciones} multiline />
      </Tarjeta>

      <Boton
        texto={w.cargando ? 'Emitiendo…' : 'Emitir contrato'}
        variante="accent"
        onPress={() => void w.emitir()}
        cargando={w.cargando}
        disabled={w.cargando || !cot || w.titularRechazado || (w.metodoPrimeraCuota === 'WALLET' && !w.saldoAlcanza)}
      />
    </View>
  )
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <View style={est.fila}>
      <Text style={est.filaK}>{k}</Text>
      <Text style={est.filaV} numberOfLines={2}>{v}</Text>
    </View>
  )
}

const est = StyleSheet.create({
  seccion: { fontSize: 14.5, fontWeight: '900', color: color.primary },
  hint: { fontSize: 12, color: color.text3, lineHeight: 17 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: color.borderSoft },
  filaK: { fontSize: 12, color: color.text3 },
  filaV: { fontSize: 12.5, fontWeight: '700', color: color.text, flexShrink: 1, textAlign: 'right' },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: color.border, backgroundColor: color.white },
  opcionOn: { backgroundColor: color.primary, borderColor: color.primary },
  opcTit: { fontSize: 13.5, fontWeight: '800', color: color.text },
  opcDet: { fontSize: 11.5, color: color.text3, marginTop: 2 },
  opcMonto: { fontSize: 15, fontWeight: '900', color: color.primary },
  totalBox: { padding: 14, borderRadius: 14, backgroundColor: color.primaryTint, borderWidth: 1, borderColor: color.borderSoft, gap: 2 },
  totalLbl: { fontSize: 11.5, fontWeight: '700', color: color.text3 },
  totalVal: { fontSize: 24, fontWeight: '900', color: color.primary },
  metodo: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: color.border, backgroundColor: color.white },
  metodoOn: { backgroundColor: color.primary, borderColor: color.primary },
  metodoTxt: { fontSize: 12.5, fontWeight: '800', color: color.text2 },
})
