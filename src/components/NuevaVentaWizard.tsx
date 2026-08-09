import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { rcvApi, type ClaseVehiculo, type GrupoVehiculo, type ProductoAseguradora, type Proveedor } from '../lib/endpoints'
import { ApiException } from '../lib/api'
import { mensajeDeError } from '../lib/api'
import { moneda, numero } from '../lib/formato'
import { Dropdown, type OpcionDrop } from './Dropdown'
import { PasoCliente, type DatosCliente } from './PasoCliente'
import { Alerta, Boton, Campo, Pildora, Tarjeta } from './Ui'
import { color } from '../lib/tema'

type TipoSeguro = 'rcv' | 'funerario'

const PASOS = ['Cotización', 'Datos del Cliente', 'Conductor', 'Registro de Pago']

/** Tarjetas de tipo de seguro (como la web: RCV y Funerario activos; el resto "Próximamente"). */
const TIPOS: { valor: TipoSeguro | null; emoji: string; texto: string; activo: boolean }[] = [
  { valor: 'rcv', emoji: '🚗', texto: 'Vehículos (RCV)', activo: true },
  { valor: 'funerario', emoji: '🕊️', texto: 'Servicio Funerario', activo: true },
  { valor: null, emoji: '🚙', texto: 'Auto (Casco)', activo: false },
  { valor: null, emoji: '❤️', texto: 'Salud y Vida', activo: false },
  { valor: null, emoji: '🏠', texto: 'Hogar y Comercio', activo: false },
]

/** Información adicional de riesgo (toggles que ajustan el precio). */
const RIESGOS = [
  { id: 'inflamables', texto: 'Para vehículos destinados al transporte de materiales inflamables, corrosivos, tóxicos o explosivos' },
  { id: 'oficiales', texto: 'Para vehículos de cuerpos policiales, bomberos, ambulancia, empresas de seguridad o transporte de fondos' },
  { id: 'remolque', texto: 'Para vehículos que remolquen embarcaciones, motocicletas, casas rodantes, equipos deportivos u otros remolques' },
]

const aOpc = <T,>(xs: T[], id: (x: T) => string, txt: (x: T) => string): OpcionDrop[] =>
  xs.map((x) => ({ valor: id(x), texto: txt(x) }))

/**
 * Nueva Venta — flujo RCV real (réplica del quote-step del portal):
 * tipo de seguro → aseguradora → clase + grupo de vehículo → info de riesgo →
 * Cotizar Planes → selección de plan. Clase/grupo/aseguradora usan endpoints
 * públicos; la cotización de planes (tarifa) requiere sesión.
 */
export function NuevaVentaWizard({ express = false }: { express?: boolean }) {
  const insets = useSafeAreaInsets()
  const [paso, setPaso] = useState(0)

  const [tipo, setTipo] = useState<TipoSeguro | null>(null)
  const [productos, setProductos] = useState<ProductoAseguradora[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productoId, setProductoId] = useState<string | null>(null)

  const [clases, setClases] = useState<ClaseVehiculo[]>([])
  const [grupos, setGrupos] = useState<GrupoVehiculo[]>([])
  const [claseId, setClaseId] = useState<string | null>(null)
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [riesgos, setRiesgos] = useState<Record<string, boolean>>({})

  const [planes, setPlanes] = useState<any[]>([])
  const [planIdx, setPlanIdx] = useState<number | null>(null)

  const [cliente, setCliente] = useState<DatosCliente | null>(null)
  const [conductorMismo, setConductorMismo] = useState(true)
  const [referenciaPago, setReferenciaPago] = useState('')

  const [cargando, setCargando] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const setCarga = (k: string, v: boolean) => setCargando((c) => ({ ...c, [k]: v }))

  // Aseguradoras (productos RCV) + clases al elegir RCV.
  useEffect(() => {
    if (tipo !== 'rcv') return
    setCarga('prod', true)
    Promise.all([
      rcvApi.productos().catch(() => []),
      rcvApi.clases().catch(() => []),
      rcvApi.proveedores().catch(() => []),
    ])
      .then(([prods, cls, provs]) => {
        setProductos((prods ?? []).filter((p) => /RCV/i.test(p.nombre)))
        setClases(cls ?? [])
        setProveedores(provs ?? [])
      })
      .finally(() => setCarga('prod', false))
  }, [tipo])

  const elegirClase = useCallback((id: string) => {
    setClaseId(id)
    setGrupoId(null)
    setGrupos([])
    setPlanes([])
    setPlanIdx(null)
    setCarga('grupos', true)
    rcvApi
      .gruposPorClase(id)
      .then((r) => setGrupos((Array.isArray(r) ? r : r.data) ?? []))
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCarga('grupos', false))
  }, [])

  const producto = useMemo(() => productos.find((p) => p.productoId === productoId), [productos, productoId])

  const cotizar = useCallback(async () => {
    if (!grupoId || !producto) return
    setCarga('planes', true)
    setError(null)
    setPlanes([])
    setPlanIdx(null)
    try {
      // El proveedorId (UUID) se resuelve cruzando producto.proveedor.id contra
      // la lista de proveedores (en el producto viene null), como en la web.
      const prov =
        proveedores.find((p) => p.id === producto.proveedor?.id)?.proveedorId ??
        producto.proveedor?.proveedorId ??
        ''
      if (!prov) {
        setError('No se pudo resolver la aseguradora. Reintenta.')
        return
      }
      const r = await rcvApi.planes(grupoId, producto.productoId, prov)
      const data = Array.isArray(r) ? r : (r?.data ?? [])
      setPlanes(data)
      if (data.length === 0) setError('No se obtuvieron planes para esta combinación.')
    } catch (e) {
      if (e instanceof ApiException && e.status === 401) {
        setError('Tu sesión no está autorizada para cotizar. Vuelve a iniciar sesión.')
      } else {
        setError(mensajeDeError(e))
      }
    } finally {
      setCarga('planes', false)
    }
  }, [grupoId, producto, proveedores])

  const puedeCotizar = !!productoId && !!claseId && !!grupoId

  return (
    <View style={{ flex: 1, backgroundColor: color.bgApp }}>
      {/* Stepper */}
      <View style={est.stepper}>
        {PASOS.map((p, i) => {
          const activo = i === paso
          const hecho = i < paso
          return (
            <View key={p} style={est.stepItem}>
              <View style={[est.stepNum, activo && est.stepNumActivo, hecho && est.stepNumHecho]}>
                <Text style={[est.stepNumTexto, (activo || hecho) && { color: '#fff' }]}>{hecho ? '✓' : i + 1}</Text>
              </View>
              <Text style={[est.stepLabel, activo && { color: color.primaryDark, fontWeight: '800' }]} numberOfLines={1}>
                {p}
              </Text>
            </View>
          )
        })}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
        <Text style={est.titulo}>{express ? 'Venta Rápida RCV' : 'Nueva Solicitud'}</Text>

        {error ? (
          <View style={{ marginBottom: 12 }}>
            <Alerta tipo="error">{error}</Alerta>
          </View>
        ) : null}

        {paso === 0 ? (
          <>
            {/* 1. Tipo de seguro */}
            <Text style={est.seccion}>1. ¿Qué tipo de seguro deseas cotizar?</Text>
            <View style={est.cards}>
              {TIPOS.map((t, i) => {
                const sel = t.activo && tipo === t.valor
                return (
                  <Pressable
                    key={i}
                    disabled={!t.activo}
                    onPress={() => {
                      setTipo(t.valor)
                      setProductoId(null)
                      setClaseId(null)
                      setGrupoId(null)
                    }}
                    style={[est.card, sel && est.cardSel, !t.activo && est.cardOff]}
                  >
                    {!t.activo ? (
                      <View style={est.proxBadge}>
                        <Text style={est.proxTexto}>Próximamente</Text>
                      </View>
                    ) : null}
                    <Text style={est.cardEmoji}>{t.emoji}</Text>
                    <Text style={[est.cardTexto, !t.activo && { color: color.text4 }]}>{t.texto}</Text>
                  </Pressable>
                )
              })}
            </View>

            {tipo === 'rcv' ? (
              <>
                {/* 2. Aseguradora */}
                <Text style={est.seccion}>2. Selecciona la aseguradora</Text>
                {cargando.prod ? (
                  <Tarjeta style={{ padding: 18 }}>
                    <Text style={est.hint}>Cargando aseguradoras…</Text>
                  </Tarjeta>
                ) : (
                  <View style={{ gap: 10 }}>
                    {productos.map((p) => {
                      const sel = p.productoId === productoId
                      return (
                        <Pressable key={p.productoId} onPress={() => setProductoId(p.productoId)}>
                          <Tarjeta style={[est.aseg, sel && est.asegSel]}>
                            <Text style={[est.asegTexto, sel && { color: '#fff' }]}>{p.nombre}</Text>
                          </Tarjeta>
                        </Pressable>
                      )
                    })}
                  </View>
                )}

                {/* 3. Datos para la cotización */}
                {productoId ? (
                  <>
                    <Text style={est.seccion}>3. Completa los datos para la cotización</Text>
                    <Tarjeta style={{ padding: 16, gap: 14 }}>
                      <Dropdown
                        etiqueta="Clase de Vehículo"
                        placeholder="Seleccione una clase"
                        opciones={aOpc(clases, (c) => c.id, (c) => c.nombre)}
                        valor={claseId}
                        onCambiar={elegirClase}
                      />
                      <Dropdown
                        etiqueta="Grupo de Vehículo"
                        placeholder="Seleccione un grupo"
                        opciones={aOpc(grupos, (g) => g.id, (g) => g.descripcion)}
                        valor={grupoId}
                        onCambiar={setGrupoId}
                        cargando={cargando.grupos}
                        deshabilitado={!claseId}
                      />
                    </Tarjeta>

                    {/* Info adicional de riesgo */}
                    <Text style={est.seccion}>Información Adicional de Riesgo</Text>
                    <Text style={est.hint}>Selecciona las opciones que apliquen para ajustar el precio.</Text>
                    <View style={{ gap: 10, marginTop: 8 }}>
                      {RIESGOS.map((r) => (
                        <Tarjeta key={r.id} style={est.riesgo}>
                          <Text style={est.riesgoTexto}>{r.texto}</Text>
                          <Switch
                            value={!!riesgos[r.id]}
                            onValueChange={(v) => setRiesgos((s) => ({ ...s, [r.id]: v }))}
                            trackColor={{ true: color.primary, false: '#CBD5E1' }}
                            thumbColor="#fff"
                          />
                        </Tarjeta>
                      ))}
                    </View>

                    <Boton
                      texto={cargando.planes ? 'Cotizando…' : 'Cotizar Planes'}
                      onPress={cotizar}
                      cargando={cargando.planes}
                      disabled={!puedeCotizar}
                      style={{ marginTop: 16 }}
                    />

                    {/* 4. Planes */}
                    {planes.length > 0 ? (
                      <>
                        <Text style={est.seccion}>4. Selecciona el plan ideal para tu cliente</Text>
                        <View style={{ gap: 12 }}>
                          {planes.map((pl, i) => (
                            <PlanCard key={i} plan={pl} activo={i === planIdx} onPress={() => setPlanIdx(i)} />
                          ))}
                        </View>
                        <Boton
                          texto="Continuar — Datos del Cliente"
                          onPress={() => setPaso(1)}
                          disabled={planIdx === null}
                          style={{ marginTop: 16 }}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : tipo === 'funerario' ? (
              <View style={{ marginTop: 8 }}>
                <Alerta tipo="info">
                  Cotización de servicio funerario: planes por edad del asegurado. Se completa en la siguiente
                  iteración con su endpoint de planes.
                </Alerta>
              </View>
            ) : (
              <View style={{ marginTop: 8 }}>
                <Alerta tipo="info">Elige un tipo de seguro para empezar la cotización.</Alerta>
              </View>
            )}
          </>
        ) : paso === 1 ? (
          // ── Paso 2 · Datos del Cliente ─────────────────────────
          <PasoCliente
            onAtras={() => setPaso(0)}
            onContinuar={(d) => {
              setCliente(d)
              setPaso(2)
            }}
          />
        ) : paso === 2 ? (
          // ── Paso 3 · Conductor ─────────────────────────────────
          <Tarjeta style={{ padding: 18, gap: 12 }}>
            <Text style={est.pasoTitulo}>Conductor</Text>
            <Text style={est.hint}>Indica quién conduce habitualmente el vehículo.</Text>
            <Pressable onPress={() => setConductorMismo((v) => !v)} style={est.check}>
              <View style={[est.checkBox, conductorMismo && est.checkOn]}>
                {conductorMismo ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
              </View>
              <Text style={{ fontSize: 13.5, color: color.text, flex: 1 }}>
                El conductor es el mismo tomador ({cliente?.nombres} {cliente?.apellidos})
              </Text>
            </Pressable>
            {!conductorMismo ? (
              <Alerta tipo="info">Los datos de un conductor distinto se capturan en la próxima iteración.</Alerta>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <Boton texto="← Atrás" variante="soft" onPress={() => setPaso(1)} style={{ flex: 1 }} />
              <Boton texto="Continuar — Pago" onPress={() => setPaso(3)} style={{ flex: 1.4 }} />
            </View>
          </Tarjeta>
        ) : (
          // ── Paso 4 · Registro de Pago ──────────────────────────
          <View style={{ gap: 12 }}>
            <Tarjeta style={{ padding: 18, gap: 12 }}>
              <Text style={est.pasoTitulo}>Registro de Pago</Text>
              <View style={est.resumenBox}>
                <FilaResumen k="Aseguradora" v={producto?.nombre ?? '—'} />
                <FilaResumen k="Plan" v={planes[planIdx ?? 0]?.grupo?.descripcion ?? planes[planIdx ?? 0]?.descripcion ?? 'Plan RCV'} />
                <FilaResumen k="Tomador" v={`${cliente?.nombres ?? ''} ${cliente?.apellidos ?? ''}`.trim() || '—'} />
                <FilaResumen k="Documento" v={`${cliente?.tipoDoc ?? ''}-${cliente?.cedula ?? ''}`} />
              </View>
              <Campo
                etiqueta="Referencia de pago móvil"
                placeholder="Últimos 6+ dígitos"
                keyboardType="number-pad"
                value={referenciaPago}
                onChangeText={(t) => setReferenciaPago(t.replace(/[^0-9]/g, ''))}
              />
              <Alerta tipo="info">
                La confirmación del pago y la emisión de la póliza (cuadro + carnet) es el paso final del flujo real
                y se integra en la próxima iteración: valida el pago contra la pasarela y crea la orden/póliza.
              </Alerta>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Boton texto="← Atrás" variante="soft" onPress={() => setPaso(2)} style={{ flex: 1 }} />
                <Boton texto="Emitir póliza" variante="exito" onPress={() => undefined} disabled={referenciaPago.length < 6} style={{ flex: 1.4 }} />
              </View>
            </Tarjeta>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function FilaResumen({ k, v }: { k: string; v: string }) {
  return (
    <View style={est.filaResumen}>
      <Text style={est.filaResumenK}>{k}</Text>
      <Text style={est.filaResumenV} numberOfLines={1}>
        {v}
      </Text>
    </View>
  )
}

/** Tarjeta de plan RCV (defensiva sobre la forma exacta del backend). */
function PlanCard({ plan, activo, onPress }: { plan: any; activo: boolean; onPress: () => void }) {
  const titulo = plan?.grupo?.descripcion ?? plan?.descripcion ?? plan?._planLabel ?? 'Plan RCV'
  const tcr = plan?.primaAnualTCR ?? plan?.finalPrice ?? plan?.prima ?? null
  const coberturas: any[] = Array.isArray(plan?.coberturas) ? plan.coberturas : []
  return (
    <Pressable onPress={onPress}>
      <Tarjeta style={[{ padding: 16 }, activo && { borderColor: color.primary, borderWidth: 2 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={est.planTitulo}>{titulo}</Text>
          {activo ? <Pildora color={color.primary} texto="Seleccionado" /> : null}
        </View>
        {coberturas.slice(0, 4).map((c, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={est.covNombre}>✔ {c?.nombre ?? c?.cobertura ?? 'Cobertura'}</Text>
            <Text style={est.covVal}>{numero(c?.sumaCobertura ?? c?.sumaAsegurada)} EUR</Text>
          </View>
        ))}
        {tcr != null ? (
          <Text style={est.planPrima}>
            TCR {moneda(tcr, '')} EUR <Text style={est.planPrimaSub}>/ Anual</Text>
          </Text>
        ) : null}
      </Tarjeta>
    </Pressable>
  )
}

const est = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    backgroundColor: color.white,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  stepItem: { flex: 1, alignItems: 'center' },
  stepNum: {
    width: 28, height: 28, borderRadius: 99, backgroundColor: color.bgCard,
    borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center',
  },
  stepNumActivo: { backgroundColor: color.primary, borderColor: color.primary },
  stepNumHecho: { backgroundColor: color.success, borderColor: color.success },
  stepNumTexto: { fontSize: 12, fontWeight: '800', color: color.text3 },
  stepLabel: { fontSize: 10, color: color.text3, marginTop: 4, textAlign: 'center' },
  titulo: { fontSize: 20, fontWeight: '800', color: color.text, marginBottom: 14, letterSpacing: -0.3 },
  seccion: { fontSize: 14.5, fontWeight: '800', color: color.text, marginTop: 22, marginBottom: 10 },
  hint: { fontSize: 12, color: color.text3, lineHeight: 17 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '47%', flexGrow: 1, backgroundColor: color.white, borderWidth: 1, borderColor: color.borderSoft,
    borderRadius: 14, paddingVertical: 20, alignItems: 'center', justifyContent: 'center', minHeight: 96,
  },
  cardSel: { borderColor: color.primary, borderWidth: 2, backgroundColor: color.primaryLight },
  cardOff: { opacity: 0.6 },
  cardEmoji: { fontSize: 26, marginBottom: 6 },
  cardTexto: { fontSize: 13, fontWeight: '800', color: color.text, textAlign: 'center' },
  proxBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#4B5563', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  proxTexto: { fontSize: 8.5, fontWeight: '700', color: '#fff' },
  aseg: { padding: 16, alignItems: 'center' },
  asegSel: { backgroundColor: color.primary, borderColor: color.primary },
  asegTexto: { fontSize: 13.5, fontWeight: '700', color: color.text, textAlign: 'center' },
  riesgo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  riesgoTexto: { flex: 1, fontSize: 12, color: color.text2, lineHeight: 17 },
  planTitulo: { fontSize: 15, fontWeight: '800', color: color.text },
  planPrima: { fontSize: 18, fontWeight: '800', color: color.primary, marginTop: 8 },
  planPrimaSub: { fontSize: 12, fontWeight: '600', color: color.text3 },
  covNombre: { fontSize: 11.5, color: color.text2 },
  covVal: { fontSize: 11.5, color: color.text, fontWeight: '700' },
  pasoTitulo: { fontSize: 16, fontWeight: '800', color: color.text, marginBottom: 8 },
  nextBadge: { alignSelf: 'flex-start', backgroundColor: color.warningBg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, marginBottom: 10 },
  nextTexto: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4, color: color.amber },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: color.borderInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: color.primary, borderColor: color.primary },
  resumenBox: { backgroundColor: color.bgCard, borderRadius: 12, padding: 12, gap: 6 },
  filaResumen: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  filaResumenK: { fontSize: 12, color: color.text3 },
  filaResumenV: { fontSize: 12.5, fontWeight: '700', color: color.text, flexShrink: 1, textAlign: 'right' },
})
