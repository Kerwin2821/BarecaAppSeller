import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Alerta, Boton, Campo, Pildora, Tarjeta } from '../Ui'
import { Dropdown, type OpcionDrop } from '../Dropdown'
import { Spinner } from '../Estados'
import { FirmaPad } from '../FirmaPad'
import { color } from '@/lib/tema'
import { moneda } from '@/lib/formato'
import {
  ATA_PARENTESCOS,
  ESTADOS_CIVILES,
  ETIQUETA_PARENTESCO,
  type AtaIntegrante,
  type AtaWizard,
} from '@/lib/atualcance'
import type { AtaDatosPersona } from '@/lib/endpoints'

const TIPOS_DOC: OpcionDrop[] = [
  { valor: 'V', texto: 'V' },
  { valor: 'E', texto: 'E' },
  { valor: 'J', texto: 'J' },
  { valor: 'P', texto: 'P' },
]
const SEXOS: OpcionDrop[] = [
  { valor: 'M', texto: 'Masculino' },
  { valor: 'F', texto: 'Femenino' },
]
const ESTADOS_CIVILES_OPC: OpcionDrop[] = ESTADOS_CIVILES.map((v) => ({ valor: v, texto: v.charAt(0) + v.slice(1).toLowerCase() }))
const PARENTESCOS_OPC: OpcionDrop[] = ATA_PARENTESCOS.filter((p) => p !== 'TITULAR').map((p) => ({ valor: p, texto: ETIQUETA_PARENTESCO[p] }))

/** dd/mm/aaaa ↔ aaaa-mm-dd (lo que espera el backend). */
const aVista = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso ?? '')
function aIso(texto: string): string {
  const d = texto.replace(/\D/g, '')
  if (d.length === 8) return `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`
  return texto
}
/** Autoformatea "ddmmaaaa" → "dd/mm/aaaa" mientras se escribe. */
function formatearFecha(t: string): string {
  const d = t.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

function Etiqueta({ children }: { children: string }) {
  return <Text style={est.seccion}>{children}</Text>
}

/** Botones cámara/galería para leer una cédula con OCR. */
function BotonesCedula({ leyendo, onCamara, onGaleria }: { leyendo: boolean; onCamara: () => void; onGaleria: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Pressable onPress={onCamara} disabled={leyendo} style={[est.ocrBtn, leyendo && { opacity: 0.5 }]}>
        <Text style={est.ocrTxt}>📷 Leer cédula</Text>
      </Pressable>
      <Pressable onPress={onGaleria} disabled={leyendo} style={[est.ocrBtn, est.ocrBtnSoft, leyendo && { opacity: 0.5 }]}>
        <Text style={[est.ocrTxt, { color: color.primary }]}>🖼 Galería</Text>
      </Pressable>
      {leyendo ? <Spinner /> : null}
    </View>
  )
}

/** Campos de una persona (contratante, titular o beneficiario). */
function PersonaForm({
  p,
  set,
  conSexo = true,
  conContacto = true,
  conRif = false,
  conEstadoCivil = false,
}: {
  p: AtaDatosPersona
  set: (campo: keyof AtaDatosPersona, valor: string) => void
  conSexo?: boolean
  conContacto?: boolean
  conRif?: boolean
  conEstadoCivil?: boolean
}) {
  const [fecha, setFecha] = useState(aVista(p.fechaNacimiento))
  // Si el OCR llenó la fecha después de montar, refléjala.
  if (p.fechaNacimiento && aVista(p.fechaNacimiento) !== fecha && fecha.replace(/\D/g, '').length !== 8) setFecha(aVista(p.fechaNacimiento))
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ width: 90 }}>
          <Dropdown etiqueta="Tipo" opciones={TIPOS_DOC} valor={p.tipoDocumento ?? 'V'} onCambiar={(v) => set('tipoDocumento', v)} />
        </View>
        <Campo etiqueta="Documento" placeholder="12345678" keyboardType="number-pad" value={p.numeroDocumento} onChangeText={(t) => set('numeroDocumento', t.replace(/\D/g, ''))} style={{ flex: 1 }} />
      </View>
      <Campo etiqueta="Nombres" placeholder="Nombres" value={p.nombres ?? ''} onChangeText={(t) => set('nombres', t)} />
      <Campo etiqueta="Apellidos" placeholder="Apellidos" value={p.apellidos ?? ''} onChangeText={(t) => set('apellidos', t)} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Campo
          etiqueta="Fecha de nacimiento"
          placeholder="dd/mm/aaaa"
          keyboardType="number-pad"
          value={fecha}
          onChangeText={(t) => { const f = formatearFecha(t); setFecha(f); if (f.replace(/\D/g, '').length === 8) set('fechaNacimiento', aIso(f)) }}
          style={{ flex: 1 }}
        />
        {conSexo ? (
          <View style={{ flex: 1 }}>
            <Dropdown etiqueta="Sexo" placeholder="Elige" opciones={SEXOS} valor={p.sexo ?? null} onCambiar={(v) => set('sexo', v)} />
          </View>
        ) : null}
      </View>
      {conRif ? <Campo etiqueta="RIF" placeholder="V123456789" autoCapitalize="characters" value={p.rif ?? ''} onChangeText={(t) => set('rif', t.toUpperCase())} /> : null}
      {conEstadoCivil ? (
        <Dropdown etiqueta="Estado civil" placeholder="Elige" opciones={ESTADOS_CIVILES_OPC} valor={p.estadoCivil ?? null} onCambiar={(v) => set('estadoCivil', v)} />
      ) : null}
      {conContacto ? (
        <>
          <Campo etiqueta="Teléfono" placeholder="04141234567" keyboardType="phone-pad" value={p.telefono ?? ''} onChangeText={(t) => set('telefono', t.replace(/\D/g, ''))} />
          <Campo etiqueta="Correo" placeholder="cliente@correo.com" keyboardType="email-address" autoCapitalize="none" value={p.correo ?? ''} onChangeText={(t) => set('correo', t.trim())} />
          <Campo etiqueta="Dirección" placeholder="Calle, urbanización, ciudad" value={p.direccion ?? ''} onChangeText={(t) => set('direccion', t)} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Campo etiqueta="Estado" placeholder="Miranda" value={p.estado ?? ''} onChangeText={(t) => set('estado', t)} style={{ flex: 1 }} />
            <Campo etiqueta="Ciudad" placeholder="Caracas" value={p.ciudad ?? ''} onChangeText={(t) => set('ciudad', t)} style={{ flex: 1 }} />
          </View>
        </>
      ) : null}
    </View>
  )
}

/** Cuestionario de salud de un integrante (preguntas 1-5 de la declaración de Latina). */
function Cuestionario({ w, i }: { w: AtaWizard; i: AtaIntegrante }) {
  const cat = w.catalogo
  const siNo = (n: number, texto: string) => {
    const r = w.respuestaSiNo(i, n)
    return (
      <View style={{ gap: 6 }}>
        <Text style={est.pregunta}>{n}. {texto}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['NO', 'SI'] as const).map((v) => (
            <Pressable key={v} onPress={() => w.responderSiNo(i, n, v)} style={[est.opc, r === v && est.opcOn]}>
              <Text style={[est.opcTxt, r === v && est.opcTxtOn]}>{v === 'SI' ? 'Sí' : 'No'}</Text>
            </Pressable>
          ))}
        </View>
        {r === 'SI' ? <Campo placeholder="Indica cuál" value={w.detalleSiNo(i, n)} onChangeText={(t) => w.responderDetalle(i, n, t)} /> : null}
      </View>
    )
  }
  const r5 = i.respuestas['5'] ?? ''
  const esMujer = (i.persona.sexo ?? '').toUpperCase() === 'F'
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Text style={est.pregunta}>1. ¿Ha sido diagnosticado o recibe tratamiento por alguna de estas? <Text style={{ color: color.warning }}>(recargo +{cat?.config.recargoFlexibilizadaPct ?? 20}% y espera de {cat?.config.mesesEsperaFlexibilizada ?? 6} meses)</Text></Text>
        {(cat?.flexibilizadas ?? []).map((p) => {
          const on = i.patologias.includes(p.patologia)
          return (
            <Pressable key={p.id} onPress={() => w.alternarPatologia(i, p.patologia)} style={est.checkFila}>
              <View style={[est.check, on && est.checkOn]}>{on ? <Text style={est.checkMark}>✓</Text> : null}</View>
              <Text style={est.checkTxt}>{p.patologia}</Text>
            </Pressable>
          )
        })}
      </View>
      <View style={{ gap: 6 }}>
        <Text style={est.pregunta}>2. ¿Presenta antecedentes o tratamiento por alguna de estas? <Text style={{ color: color.danger }}>(no afiliable)</Text></Text>
        {(cat?.excluyentes ?? []).map((p) => {
          const on = i.patologias.includes(p.patologia)
          return (
            <Pressable key={p.id} onPress={() => w.alternarPatologia(i, p.patologia)} style={est.checkFila}>
              <View style={[est.check, on && est.checkBad]}>{on ? <Text style={est.checkMark}>✓</Text> : null}</View>
              <Text style={est.checkTxt}>{p.patologia}</Text>
            </Pressable>
          )
        })}
        {w.noAsegurable(i) ? <Alerta tipo="error">Con una patología excluyente declarada esta persona no es asegurable: quítala del grupo familiar.</Alerta> : null}
      </View>
      {siNo(3, '¿Tiene intervenciones quirúrgicas programadas o exámenes pendientes de resultado?')}
      {siNo(4, '¿Toma medicamentos de uso diario o continuo recetados?')}
      <View style={{ gap: 6 }}>
        <Text style={est.pregunta}>5. ¿Se encuentra en estado de embarazo o en tratamiento de fertilidad? <Text style={{ color: color.text3 }}>(mujeres de 18 a 45 años)</Text></Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['NO', 'No'], ['SI', 'Sí'], ['NO_APLICA', 'No aplica']] as const).map(([v, t]) => (
            <Pressable key={v} onPress={() => w.responder(i, 5, v)} style={[est.opc, r5 === v && est.opcOn]}>
              <Text style={[est.opcTxt, r5 === v && est.opcTxtOn]}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Campo etiqueta="Estatura (cm)" placeholder="170" keyboardType="number-pad" value={i.alturaCm != null ? String(i.alturaCm) : ''} onChangeText={(t) => w.actualizarIntegrante(i.clave, { alturaCm: t ? Number(t.replace(/\D/g, '')) : null })} style={{ flex: 1 }} />
        <Campo etiqueta="Peso (kg)" placeholder="70" keyboardType="decimal-pad" value={i.pesoKg != null ? String(i.pesoKg) : ''} onChangeText={(t) => w.actualizarIntegrante(i.clave, { pesoKg: t ? Number(t.replace(',', '.')) : null })} style={{ flex: 1 }} />
      </View>
      {i.alturaCm && i.pesoKg ? <Text style={est.imc}>IMC: {(i.pesoKg / Math.pow(i.alturaCm / 100, 2)).toFixed(1)}</Text> : null}
      {esMujer ? (
        <Pressable onPress={() => w.actualizarIntegrante(i.clave, { maternidad: !i.maternidad })} style={est.checkFila}>
          <View style={[est.check, i.maternidad && est.checkOn]}>{i.maternidad ? <Text style={est.checkMark}>✓</Text> : null}</View>
          <Text style={est.checkTxt}>Agregar servicio de <Text style={{ fontWeight: '800' }}>Maternidad</Text> (USD 3.000, de 18 a 45 años)</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/** Resultado de la cotización para un integrante. */
function LineaResultado({ w, i }: { w: AtaWizard; i: AtaIntegrante }) {
  const l = w.lineaDe(i)
  if (!l) return null
  return (
    <View style={[est.linea, !l.elegible && est.lineaBad]}>
      <View style={{ flex: 1 }}>
        <Text style={est.lineaTit}>{ETIQUETA_PARENTESCO[l.parentesco] ?? l.parentesco} · {l.edad} años</Text>
        {l.elegible ? (
          <Text style={est.lineaDet}>
            {moneda(l.totalSemanalUsd, '$')}/semana · {moneda(l.totalAnualUsd, '$')}/año
            {l.recargoPct > 0 ? `  (+${l.recargoPct}% preexistencia)` : ''}{l.maternidad ? '  + maternidad' : ''}
          </Text>
        ) : (
          <Text style={[est.lineaDet, { color: color.danger }]}>{l.motivo || 'No admisible'}</Text>
        )}
      </View>
      <Pildora texto={l.elegible ? (l.recargoPct > 0 ? 'Con recargo' : 'Aprobado') : 'Rechazado'} color={l.elegible ? (l.recargoPct > 0 ? color.warning : color.success) : color.danger} />
    </View>
  )
}

export function AtaSolicitud({ w }: { w: AtaWizard }) {
  const [firmando, setFirmando] = useState(false)
  const [saludAbierta, setSaludAbierta] = useState<string | null>(null)
  const planes: OpcionDrop[] = (w.catalogo?.planes ?? []).map((p) => ({ valor: p.id, texto: `${p.nombre} — ${moneda(p.hospitalizacionCirugiaUsd, '$')} hospitalización y cirugía` }))

  return (
    <View style={{ gap: 12 }}>
      {/* Plan */}
      <Tarjeta style={{ padding: 18, gap: 12 }}>
        <Etiqueta>Plan</Etiqueta>
        <Dropdown placeholder="Selecciona el plan" opciones={planes} valor={w.planId || null} onCambiar={w.setPlanId} />
        {w.plan ? (
          <Text style={est.hint}>
            Hospitalización y cirugía {moneda(w.plan.hospitalizacionCirugiaUsd, '$')} · medicamentos agudos {moneda(w.plan.medicamentosAgudasUsd, '$')} · {w.plan.serviciosApsAnio} atenciones primarias al año · urgencias ilimitadas con Nueve Once.
          </Text>
        ) : null}
      </Tarjeta>

      {/* Contratante */}
      <Tarjeta style={{ padding: 18, gap: 12 }}>
        <Etiqueta>Contratante (quien paga)</Etiqueta>
        <BotonesCedula leyendo={w.leyendoCedula === 'CONTRATANTE'} onCamara={() => void w.leerCedula('camara', 'CONTRATANTE')} onGaleria={() => void w.leerCedula('galeria', 'CONTRATANTE')} />
        <PersonaForm p={w.contratante} set={w.setContratante} conSexo={false} conEstadoCivil />
        <Pressable onPress={() => w.setContratanteEsTitular(!w.contratanteEsTitular)} style={est.checkFila}>
          <View style={[est.check, w.contratanteEsTitular && est.checkOn]}>{w.contratanteEsTitular ? <Text style={est.checkMark}>✓</Text> : null}</View>
          <Text style={est.checkTxt}>El contratante es también el <Text style={{ fontWeight: '800' }}>titular</Text> del plan</Text>
        </Pressable>
      </Tarjeta>

      {/* Titular */}
      {w.titular ? (
        <Tarjeta style={{ padding: 18, gap: 12 }}>
          <Etiqueta>Titular</Etiqueta>
          {!w.contratanteEsTitular ? (
            <>
              <BotonesCedula leyendo={w.leyendoCedula === 'TITULAR'} onCamara={() => void w.leerCedula('camara', 'TITULAR')} onGaleria={() => void w.leerCedula('galeria', 'TITULAR')} />
              <PersonaForm p={w.titular.persona} set={(c, v) => w.setPersona(w.titular!, c, v)} conRif />
            </>
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={est.hint}>Mismos datos del contratante. Solo falta:</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Dropdown etiqueta="Sexo" placeholder="Elige" opciones={SEXOS} valor={w.titular.persona.sexo ?? null} onCambiar={(v) => w.setPersona(w.titular!, 'sexo', v)} />
                </View>
                <Campo etiqueta="RIF" placeholder="V123456789" autoCapitalize="characters" value={w.titular.persona.rif ?? ''} onChangeText={(t) => w.setPersona(w.titular!, 'rif', t.toUpperCase())} style={{ flex: 1 }} />
              </View>
            </View>
          )}
          <Pressable onPress={() => setSaludAbierta(saludAbierta === w.titular!.clave ? null : w.titular!.clave)} style={est.saludBtn}>
            <Text style={est.saludBtnTxt}>🩺 Declaración de salud del titular {saludAbierta === w.titular.clave ? '▲' : '▼'}</Text>
          </Pressable>
          {saludAbierta === w.titular.clave ? <Cuestionario w={w} i={w.titular} /> : null}
          <LineaResultado w={w} i={w.titular} />
        </Tarjeta>
      ) : null}

      {/* Beneficiarios */}
      {w.beneficiarios.map((b, idx) => (
        <Tarjeta key={b.clave} style={{ padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Etiqueta>{`Beneficiario ${idx + 1}`}</Etiqueta>
            <Pressable onPress={() => w.quitarIntegrante(b.clave)} hitSlop={8}><Text style={{ color: color.danger, fontWeight: '800', fontSize: 12 }}>Quitar</Text></Pressable>
          </View>
          <Dropdown etiqueta="Parentesco" opciones={PARENTESCOS_OPC} valor={b.parentesco} onCambiar={(v) => w.actualizarIntegrante(b.clave, { parentesco: v })} />
          <BotonesCedula leyendo={w.leyendoCedula === b.clave} onCamara={() => void w.leerCedula('camara', 'BENEFICIARIO', b)} onGaleria={() => void w.leerCedula('galeria', 'BENEFICIARIO', b)} />
          <PersonaForm p={b.persona} set={(c, v) => w.setPersona(b, c, v)} conContacto={!b.contactoIgualTitular} />
          <Pressable onPress={() => w.actualizarIntegrante(b.clave, { contactoIgualTitular: !b.contactoIgualTitular })} style={est.checkFila}>
            <View style={[est.check, b.contactoIgualTitular && est.checkOn]}>{b.contactoIgualTitular ? <Text style={est.checkMark}>✓</Text> : null}</View>
            <Text style={est.checkTxt}>Mismo contacto (teléfono, correo, dirección) que el titular</Text>
          </Pressable>
          <Pressable onPress={() => setSaludAbierta(saludAbierta === b.clave ? null : b.clave)} style={est.saludBtn}>
            <Text style={est.saludBtnTxt}>🩺 Declaración de salud {saludAbierta === b.clave ? '▲' : '▼'}</Text>
          </Pressable>
          {saludAbierta === b.clave ? <Cuestionario w={w} i={b} /> : null}
          <LineaResultado w={w} i={b} />
        </Tarjeta>
      ))}
      <Boton texto="+ Agregar beneficiario" variante="soft" onPress={() => w.agregarIntegrante('HIJO')} />

      {/* Validar admisibilidad (cotizar) */}
      <Tarjeta style={{ padding: 18, gap: 12 }}>
        <Etiqueta>Admisibilidad y precio</Etiqueta>
        <Text style={est.hint}>El sistema valida edades, patologías y calcula la cuota de cada afiliado. Repite la validación si cambias el grupo.</Text>
        <Boton texto={w.cargando ? 'Validando…' : w.cotizacion ? 'Volver a validar' : 'Validar admisibilidad'} variante="primary" onPress={() => void w.cotizar()} cargando={w.cargando} disabled={w.cargando} />
        {w.cotizacion ? (
          <View style={est.totalBox}>
            <Text style={est.totalLbl}>Total del grupo</Text>
            <Text style={est.totalVal}>{moneda(w.cotizacion.totalSemanalUsd, '$')} / semana</Text>
            <Text style={est.hint}>{moneda(w.cotizacion.totalAnualUsd, '$')} al año · {w.cotizacion.semanas} semanas · {w.lineasElegibles.length} afiliado(s)</Text>
            {w.cotizacion.avisos.map((a, k) => <Text key={k} style={[est.hint, { color: color.warning }]}>• {a}</Text>)}
          </View>
        ) : null}
      </Tarjeta>

      {/* Declaración jurada + firma */}
      <Tarjeta style={{ padding: 18, gap: 12 }}>
        <Etiqueta>Declaración jurada y firma</Etiqueta>
        <Text style={est.declaracion}>{w.catalogo?.cuestionario?.textoDeclaracion || 'El Solicitante/Titular declara bajo fe de juramento que todas las respuestas, datos e información consignados en la presente Solicitud de Afiliación y Declaración de Salud son veraces, exactos, completos y actualizados.'}</Text>
        <Pressable onPress={() => w.setDeclaracionAceptada(!w.declaracionAceptada)} style={est.checkFila}>
          <View style={[est.check, w.declaracionAceptada && est.checkOn]}>{w.declaracionAceptada ? <Text style={est.checkMark}>✓</Text> : null}</View>
          <Text style={[est.checkTxt, { fontWeight: '700' }]}>El contratante acepta la declaración jurada de salud</Text>
        </Pressable>
        {w.firmaPng ? (
          <View style={{ gap: 8 }}>
            <View style={est.firmaBox}><Image source={{ uri: w.firmaPng }} style={{ width: '100%', height: 110 }} resizeMode="contain" /></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {w.guardandoFirma ? <Spinner /> : <Text style={{ color: w.firmaUrl ? color.success : color.warning, fontWeight: '700', fontSize: 12 }}>{w.firmaUrl ? '✓ Firma guardada' : 'Guardando…'}</Text>}
              <Pressable onPress={w.borrarFirma} hitSlop={6}><Text style={{ color: color.danger, fontWeight: '700', fontSize: 12 }}>Firmar de nuevo</Text></Pressable>
            </View>
          </View>
        ) : (
          <Boton texto="✍️ Firmar" variante="accent" onPress={() => setFirmando(true)} disabled={!w.declaracionAceptada} />
        )}
      </Tarjeta>

      <FirmaPad abierto={firmando} onCerrar={() => setFirmando(false)} onFirmar={(png) => void w.guardarFirma(png)} />
    </View>
  )
}

const est = StyleSheet.create({
  seccion: { fontSize: 14.5, fontWeight: '900', color: color.primary },
  hint: { fontSize: 12, color: color.text3, lineHeight: 17 },
  ocrBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: color.primary },
  ocrBtnSoft: { backgroundColor: color.primaryLight },
  ocrTxt: { fontSize: 12, fontWeight: '800', color: '#fff' },
  checkFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: color.border, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: color.primary, borderColor: color.primary },
  checkBad: { backgroundColor: color.danger, borderColor: color.danger },
  checkMark: { color: '#fff', fontWeight: '900', fontSize: 13 },
  checkTxt: { flex: 1, fontSize: 12.5, color: color.text, lineHeight: 17 },
  pregunta: { fontSize: 12.5, fontWeight: '700', color: color.text, lineHeight: 18 },
  opc: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: color.border, backgroundColor: color.white },
  opcOn: { backgroundColor: color.primary, borderColor: color.primary },
  opcTxt: { fontSize: 12.5, fontWeight: '700', color: color.text2 },
  opcTxtOn: { color: '#fff' },
  imc: { fontSize: 12, color: color.text3, fontWeight: '700' },
  saludBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: color.primaryTint, borderWidth: 1, borderColor: color.borderSoft },
  saludBtnTxt: { fontSize: 13, fontWeight: '800', color: color.primary },
  linea: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: color.successBg, borderWidth: 1, borderColor: color.success },
  lineaBad: { backgroundColor: color.dangerBg, borderColor: color.dangerBorder },
  lineaTit: { fontSize: 13, fontWeight: '800', color: color.text },
  lineaDet: { fontSize: 12, color: color.text2, marginTop: 2 },
  totalBox: { padding: 14, borderRadius: 14, backgroundColor: color.primaryTint, borderWidth: 1, borderColor: color.borderSoft, gap: 2 },
  totalLbl: { fontSize: 11.5, fontWeight: '700', color: color.text3 },
  totalVal: { fontSize: 22, fontWeight: '900', color: color.primary },
  declaracion: { fontSize: 12, color: color.text2, lineHeight: 18, fontStyle: 'italic' },
  firmaBox: { borderWidth: 1, borderColor: color.border, borderRadius: 12, backgroundColor: '#fff', padding: 6 },
})
