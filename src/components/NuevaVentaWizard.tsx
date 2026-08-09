import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { paymentApi, rcvApi, type ClaseVehiculo, type GrupoVehiculo, type ProductoAseguradora, type Proveedor } from '../lib/endpoints'
import { ApiException, mensajeDeError } from '../lib/api'
import { moneda, numero } from '../lib/formato'
import { Dropdown, type OpcionDrop } from './Dropdown'
import { PasoCliente, type DatosCliente } from './PasoCliente'
import { useToast } from './Toast'
import { Alerta, Boton, Campo, Pildora, Tarjeta } from './Ui'
import { color } from '../lib/tema'

const BANCOS: OpcionDrop[] = [
  { valor: '0169', texto: '0169 — Mi Banco' },
  { valor: '0102', texto: '0102 — Banco de Venezuela' },
  { valor: '0105', texto: '0105 — Mercantil' },
  { valor: '0134', texto: '0134 — Banesco' },
  { valor: '0108', texto: '0108 — Provincial' },
  { valor: '0191', texto: '0191 — BNC' },
]

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

/** Monto del plan en Bs (numérico), 0 si no se puede resolver. */
function bsDePlan(plan: any): number {
  if (!plan) return 0
  const bs = plan.montoTotalVES ?? plan.totalVes ?? plan.primaTotalBs ?? plan.montoTotal ?? plan.finalTotalVES
  if (typeof bs === 'number' && bs > 0) return bs
  const tcr = plan.primaAnualTCR ?? plan.finalPrice ?? plan.prima
  const tasa = plan.tasaBcv ?? plan.tasaCambio ?? plan.tasa
  if (typeof tcr === 'number' && typeof tasa === 'number' && tasa > 0) return tcr * tasa
  return 0
}

/** Total a pagar del plan (Bs si el backend lo trae, si no TCR en EUR). */
function totalVenta(plan: any): string {
  if (!plan) return '—'
  const bs = plan.montoTotalVES ?? plan.totalVes ?? plan.primaTotalBs ?? plan.montoTotal ?? plan.finalTotalVES
  if (typeof bs === 'number' && bs > 0) return moneda(bs, 'Bs.')
  const tcr = plan.primaAnualTCR ?? plan.finalPrice ?? plan.prima
  const tasa = plan.tasaBcv ?? plan.tasaCambio ?? plan.tasa
  if (typeof tcr === 'number' && typeof tasa === 'number' && tasa > 0) return moneda(tcr * tasa, 'Bs.')
  if (typeof tcr === 'number') return `${moneda(tcr, '')} EUR`
  return '—'
}

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

  // Adicionales de la cotización (como la web): puestos + APOV + Grúa.
  const [puestos, setPuestos] = useState('5')
  const [apovOn, setApovOn] = useState(false)
  const [apov, setApov] = useState<any>(null)
  const [apovCargando, setApovCargando] = useState(false)
  const [gruaOn, setGruaOn] = useState(false)

  useEffect(() => {
    if (!apovOn) {
      setApov(null)
      return
    }
    const n = Number(puestos)
    if (!n || n < 1) return
    let vivo = true
    setApovCargando(true)
    rcvApi
      .apov(n)
      .then((r) => vivo && setApov(r?.data ?? r))
      .catch(() => vivo && setApov(null))
      .finally(() => vivo && setApovCargando(false))
    return () => {
      vivo = false
    }
  }, [apovOn, puestos])

  const [cliente, setCliente] = useState<DatosCliente | null>(null)
  const [conductorTipo, setConductorTipo] = useState<'tomador' | 'otro'>('tomador')
  const [referenciaPago, setReferenciaPago] = useState('')
  const [telefonoPago, setTelefonoPago] = useState('')
  const [bancoPago, setBancoPago] = useState('0169')
  const [metodoPago, setMetodoPago] = useState<'PAGO_MOVIL' | 'DEBITO'>('PAGO_MOVIL')
  const [emitiendo, setEmitiendo] = useState(false)
  // Fases del pago (como el stepper de la web): datos → OTP → éxito.
  const [fasePago, setFasePago] = useState<'datos' | 'otp' | 'exito'>('datos')
  const [otpCodigo, setOtpCodigo] = useState('')
  const [emision, setEmision] = useState<{ id?: string; poliza?: string; carnet?: string; condicionado?: string; numero?: string } | null>(null)
  const [descuentoOn, setDescuentoOn] = useState(false)
  const { avisar } = useToast()

  /** Llama a la emisión final (crea póliza + cuadro + carnet) y pasa a "éxito". */
  const finalizarEmision = useCallback(async () => {
    const prod = productos.find((p) => p.productoId === productoId)
    if (!cliente || !prod) return
    setEmitiendo(true)
    try {
      const payload = {
        paymentMethod: metodoPago,
        paymentReference: referenciaPago,
        otp: otpCodigo || undefined,
        banco: bancoPago,
        telefonoPago,
        incluirApov: apovOn,
        cantidadPuestos: Number(puestos) || undefined,
        conductor: conductorTipo,
        productoId: prod.productoId,
        grupoId,
        cliente: {
          cedula: `${cliente.tipoDoc}-${cliente.cedula}`,
          nombres: cliente.nombres,
          apellidos: cliente.apellidos,
          sexo: cliente.genero,
          fechaNacimiento: cliente.fechaNacimiento,
          estadoId: cliente.estadoId,
          municipioId: cliente.municipioId,
          ciudadId: cliente.ciudadId,
        },
        vehiculo: {
          placa: cliente.placa,
          serialNiv: cliente.serialNiv,
          serialMotor: cliente.serialMotor,
          color: cliente.color,
          marca: cliente.marca,
          modelo: cliente.modelo,
        },
        plan: planes[planIdx ?? 0],
      }
      const r = await paymentApi.finalizePolicy(payload)
      const d = r?.data ?? r ?? {}
      setEmision({
        id: d.transactionId ?? d.idTransaccion ?? d.numeroOrden,
        numero: d.policyNumber ?? d.numeroPoliza,
        poliza: d.poliza ?? d.urlPoliza ?? d.comprobante,
        carnet: d.carnet ?? d.urlCarnet,
        condicionado: d.condicionado ?? d.urlCondicionado,
      })
      setFasePago('exito')
      avisar('Póliza emitida.', 'ok')
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    } finally {
      setEmitiendo(false)
    }
  }, [cliente, productos, productoId, grupoId, planes, planIdx, referenciaPago, otpCodigo, bancoPago, telefonoPago, metodoPago, apovOn, puestos, conductorTipo, avisar])

  /** Paso 1 del pago: valida y avanza. Débito pide OTP; pago móvil emite tras confirmar. */
  const iniciarPago = useCallback(() => {
    if (metodoPago === 'DEBITO') {
      // El banco envía el SMS con la clave dinámica; pasamos al paso OTP.
      setFasePago('otp')
      return
    }
    Alert.alert(
      'Emitir póliza',
      'Se registra el pago móvil y se emite la póliza (cuadro + carnet). Confírmalo solo cuando el pago esté hecho. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Emitir', onPress: () => void finalizarEmision() },
      ],
    )
  }, [metodoPago, finalizarEmision])

  /** Reinicia el asistente para una nueva venta (tras emitir con éxito). */
  const reiniciar = useCallback(() => {
    setPaso(0)
    setTipo(null)
    setProductoId(null)
    setClaseId(null)
    setGrupoId(null)
    setGrupos([])
    setRiesgos({})
    setPlanes([])
    setPlanIdx(null)
    setPuestos('5')
    setApovOn(false)
    setApov(null)
    setGruaOn(false)
    setCliente(null)
    setConductorTipo('tomador')
    setReferenciaPago('')
    setTelefonoPago('')
    setBancoPago('0169')
    setMetodoPago('PAGO_MOVIL')
    setFasePago('datos')
    setOtpCodigo('')
    setEmision(null)
    setDescuentoOn(false)
    setError(null)
  }, [])

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

                        {/* Configura los adicionales (APOV / Grúa) */}
                        {planIdx !== null ? (
                          <>
                            <Text style={est.seccion}>Configura los adicionales</Text>
                            <Campo
                              etiqueta="Cantidad de puestos del vehículo"
                              placeholder="Ej. 5"
                              keyboardType="number-pad"
                              value={puestos}
                              onChangeText={(t) => setPuestos(t.replace(/[^0-9]/g, ''))}
                            />
                            <Tarjeta style={{ padding: 16, marginTop: 10 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={est.adTitulo}>🛡️ Servicio Adicional: APOV</Text>
                                  <Text style={est.hint}>Responsabilidad Civil para Ocupantes (RCV Ocupantes).</Text>
                                </View>
                                <Switch value={apovOn} onValueChange={setApovOn} trackColor={{ true: color.primary, false: '#CBD5E1' }} thumbColor="#fff" />
                              </View>
                              {apovOn ? (
                                apovCargando ? (
                                  <Text style={[est.hint, { marginTop: 10 }]}>Calculando APOV…</Text>
                                ) : apov ? (
                                  <View style={est.apovBox}>
                                    {[
                                      ['Muerte Accidental', apov.muerteTotal],
                                      ['Invalidez Permanente', apov.invalidezTotal],
                                      ['Gastos Médicos', apov.gastosMedicosTotal],
                                      ['Gastos de Entierro', apov.servicioFunerariosTotal],
                                    ]
                                      .filter(([, v]) => typeof v === 'number' && v > 0)
                                      .map(([k, v]) => (
                                        <View key={String(k)} style={est.apovFila}>
                                          <Text style={est.apovK}>{k}</Text>
                                          <Text style={est.apovV}>{moneda(v as number, 'Bs.')}</Text>
                                        </View>
                                      ))}
                                    <View style={[est.apovFila, est.apovTotalFila]}>
                                      <Text style={est.apovTotalK}>Prima APOV Total</Text>
                                      <Text style={est.apovTotalV}>{moneda(apov.primaFinalTotal ?? 0, 'Bs.')}</Text>
                                    </View>
                                  </View>
                                ) : (
                                  <Text style={[est.hint, { marginTop: 10 }]}>No se pudo calcular el APOV.</Text>
                                )
                              ) : null}
                            </Tarjeta>

                            {/* Total estimado */}
                            <Tarjeta style={est.totalEstimado}>
                              <FilaResumen k={`Plan (${planes[planIdx]?.grupo?.descripcion ?? 'RCV'})`} v={moneda(bsDePlan(planes[planIdx]), 'Bs.')} />
                              {apovOn && apov ? <FilaResumen k="+ APOV" v={moneda(apov.primaFinalTotal ?? 0, 'Bs.')} /> : null}
                              <View style={est.totalDivider} />
                              <View style={est.apovFila}>
                                <Text style={est.totalEstK}>Total estimado</Text>
                                <Text style={est.totalEstV}>
                                  {moneda(bsDePlan(planes[planIdx]) + (apovOn && apov ? (apov.primaFinalTotal ?? 0) : 0), 'Bs.')}
                                </Text>
                              </View>
                            </Tarjeta>
                          </>
                        ) : null}

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
          // ── Paso 3 · Conductor Frecuente ───────────────────────
          <Tarjeta style={{ padding: 18, gap: 12 }}>
            <Text style={est.pasoTitulo}>Conductor Frecuente</Text>
            <Text style={est.hint}>Define quién será el conductor principal del vehículo.</Text>
            {(
              [
                ['tomador', `${cliente?.nombres ?? ''} ${cliente?.apellidos ?? ''}`.trim() + ' (Tomador)'],
                ['otro', 'Otra Persona'],
              ] as const
            ).map(([v, label]) => {
              const sel = conductorTipo === v
              return (
                <Pressable key={v} onPress={() => setConductorTipo(v)} style={[est.radioFila, sel && est.radioFilaOn]}>
                  <View style={[est.radio, sel && { borderColor: color.primary }]}>
                    {sel ? <View style={est.radioDot} /> : null}
                  </View>
                  <Text style={{ fontSize: 13.5, fontWeight: sel ? '800' : '600', color: sel ? color.primaryDark : color.text, flex: 1 }}>
                    {label}
                  </Text>
                </Pressable>
              )
            })}
            {conductorTipo === 'otro' ? (
              <Alerta tipo="info">Los datos de un conductor distinto se capturan en la próxima iteración.</Alerta>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <Boton texto="← Atrás" variante="soft" onPress={() => setPaso(1)} style={{ flex: 1 }} />
              <Boton texto="Siguiente Paso" onPress={() => setPaso(3)} style={{ flex: 1.4 }} />
            </View>
          </Tarjeta>
        ) : fasePago === 'exito' ? (
          // ── Pago · Éxito (ID de transacción + descargas) ───────
          <PagoExito emision={emision} onNuevo={reiniciar} />
        ) : (
          // ── Paso 4 · Registro del Pago (réplica del stepper de la web) ──
          <View style={{ gap: 12 }}>
            {/* Sub-stepper del pago: Ingresa Datos → Recibe SMS → Confirma */}
            <View style={est.pagoSteps}>
              {['Ingresa Datos', 'Recibe SMS', 'Confirma'].map((s, i) => {
                const idx = fasePago === 'otp' ? 1 : 0
                const activo = i === idx
                const hecho = i < idx
                return (
                  <View key={s} style={est.pagoStepItem}>
                    <View style={[est.pagoDot, activo && est.pagoDotOn, hecho && est.pagoDotHecho]}>
                      <Text style={[est.pagoDotTxt, (activo || hecho) && { color: '#fff' }]}>{hecho ? '✓' : i + 1}</Text>
                    </View>
                    <Text style={[est.pagoStepLabel, activo && { color: color.primaryDark, fontWeight: '800' }]} numberOfLines={1}>
                      {s}
                    </Text>
                  </View>
                )
              })}
            </View>

            {fasePago === 'datos' ? (
              <>
                {/* Resumen de la venta */}
                <Tarjeta style={{ padding: 16 }}>
                  <Text style={est.pasoTitulo}>Registro del Pago</Text>
                  <View style={est.resumenBox}>
                    <FilaResumen k="Aseguradora" v={producto?.nombre ?? '—'} />
                    <FilaResumen k="Plan" v={planes[planIdx ?? 0]?.grupo?.descripcion ?? planes[planIdx ?? 0]?.descripcion ?? 'Plan RCV'} />
                    <FilaResumen k="Tomador" v={`${cliente?.nombres ?? ''} ${cliente?.apellidos ?? ''}`.trim() || '—'} />
                    <FilaResumen k="Documento" v={`${cliente?.tipoDoc ?? ''}-${cliente?.cedula ?? ''}`} />
                  </View>
                </Tarjeta>

                {/* Desglose: Monto Base + APOV + Total (como la web) */}
                <Tarjeta style={{ padding: 16, gap: 4 }}>
                  <FilaResumen k="Monto Base" v={moneda(bsDePlan(planes[planIdx ?? 0]), 'Bs.')} />
                  {apovOn && apov ? <FilaResumen k="+ APOV (RCV Ocupantes)" v={moneda(apov.primaFinalTotal ?? 0, 'Bs.')} /> : null}
                  <Pressable onPress={() => setDescuentoOn((v) => !v)} style={est.descuentoFila}>
                    <View style={[est.checkBox, descuentoOn && est.checkOn]}>
                      {descuentoOn ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>✓</Text> : null}
                    </View>
                    <Text style={{ fontSize: 12.5, color: color.text2, flex: 1 }}>
                      Aplicar descuento por comisión prepagada (el monto final lo confirma el backend al emitir)
                    </Text>
                  </Pressable>
                  <View style={est.totalDivider} />
                  <View style={est.apovFila}>
                    <Text style={est.totalEstK}>Total a {metodoPago === 'PAGO_MOVIL' ? 'Pagar' : 'Debitar'}</Text>
                    <Text style={est.totalEstV}>
                      {moneda(bsDePlan(planes[planIdx ?? 0]) + (apovOn && apov ? (apov.primaFinalTotal ?? 0) : 0), 'Bs.')}
                    </Text>
                  </View>
                </Tarjeta>

                {/* Método de pago */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {([['PAGO_MOVIL', '📲 Pago Móvil'], ['DEBITO', '💳 Débito Inmediato']] as const).map(([m, t]) => (
                    <Pressable key={m} onPress={() => setMetodoPago(m)} style={[est.metodoBtn, metodoPago === m && est.metodoBtnOn]}>
                      <Text style={{ fontSize: 12.5, fontWeight: '800', color: metodoPago === m ? '#fff' : color.text2 }}>{t}</Text>
                    </Pressable>
                  ))}
                </View>

                <Tarjeta style={{ padding: 18, gap: 14 }}>
                  {metodoPago === 'PAGO_MOVIL' ? (
                    <>
                      <Text style={est.metodoTitulo}>Datos para el Pago Móvil</Text>
                      <Text style={est.hint}>Indícanos desde dónde realizarás el pago móvil para identificarlo.</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Dropdown etiqueta="Banco emisor" opciones={BANCOS} valor={bancoPago} onCambiar={setBancoPago} />
                        </View>
                        <Campo
                          etiqueta="Teléfono emisor"
                          placeholder="04141234567"
                          keyboardType="phone-pad"
                          value={telefonoPago}
                          onChangeText={(t) => setTelefonoPago(t.replace(/[^0-9]/g, ''))}
                          style={{ flex: 1 }}
                        />
                      </View>
                      <Campo
                        etiqueta="Referencia de pago móvil"
                        placeholder="Últimos 6+ dígitos"
                        keyboardType="number-pad"
                        value={referenciaPago}
                        onChangeText={(t) => setReferenciaPago(t.replace(/[^0-9]/g, ''))}
                      />
                    </>
                  ) : (
                    <>
                      <Text style={est.metodoTitulo}>Datos del Titular de la Cuenta</Text>
                      <Text style={est.hint}>El banco enviará un SMS con la clave dinámica (OTP) para autorizar el débito.</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Dropdown etiqueta="Banco emisor" opciones={BANCOS} valor={bancoPago} onCambiar={setBancoPago} />
                        </View>
                        <Campo
                          etiqueta="Teléfono afiliado"
                          placeholder="04141234567"
                          keyboardType="phone-pad"
                          value={telefonoPago}
                          onChangeText={(t) => setTelefonoPago(t.replace(/[^0-9]/g, ''))}
                          style={{ flex: 1 }}
                        />
                      </View>
                    </>
                  )}

                  <Alerta tipo="info">
                    Al emitir se genera una orden de pago real y se crea la póliza (cuadro + carnet). Confírmalo solo
                    cuando el pago esté hecho.
                  </Alerta>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <Boton texto="← Atrás" variante="soft" onPress={() => setPaso(2)} style={{ flex: 1 }} />
                    <Boton
                      texto={
                        emitiendo
                          ? 'Emitiendo…'
                          : metodoPago === 'DEBITO'
                            ? 'Recibir clave SMS'
                            : 'Emitir póliza'
                      }
                      variante="exito"
                      onPress={iniciarPago}
                      cargando={emitiendo}
                      disabled={
                        telefonoPago.length < 7 || (metodoPago === 'PAGO_MOVIL' && referenciaPago.length < 6)
                      }
                      style={{ flex: 1.4 }}
                    />
                  </View>
                </Tarjeta>
              </>
            ) : (
              // ── Fase OTP · Verifica tu Identidad (Débito) ──────
              <Tarjeta style={{ padding: 20, gap: 14 }}>
                <Text style={est.pasoTitulo}>Verifica tu Identidad</Text>
                <Text style={est.hint}>
                  Ingresa la clave dinámica (OTP) que el banco envió por SMS al teléfono afiliado para autorizar el
                  débito de {totalVenta(planes[planIdx ?? 0])}.
                </Text>
                <Campo
                  etiqueta="Clave dinámica (OTP)"
                  placeholder="••••••"
                  keyboardType="number-pad"
                  value={otpCodigo}
                  onChangeText={(t) => setOtpCodigo(t.replace(/[^0-9]/g, ''))}
                  style={{ marginTop: 4 }}
                />
                <Alerta tipo="error">
                  Confirmar debita el monto de la cuenta del cliente y emite la póliza. La orquestación exacta del OTP
                  se coordina con el equipo del BFF.
                </Alerta>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <Boton texto="← Atrás" variante="soft" onPress={() => setFasePago('datos')} style={{ flex: 1 }} />
                  <Boton
                    texto={emitiendo ? 'Emitiendo…' : 'Confirmar y Emitir'}
                    variante="exito"
                    onPress={() => void finalizarEmision()}
                    cargando={emitiendo}
                    disabled={otpCodigo.length < 4}
                    style={{ flex: 1.4 }}
                  />
                </View>
              </Tarjeta>
            )}
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

/** Pantalla de éxito: ID de transacción + descarga de documentos (como la web). */
function PagoExito({
  emision,
  onNuevo,
}: {
  emision: { id?: string; poliza?: string; carnet?: string; condicionado?: string; numero?: string } | null
  onNuevo: () => void
}) {
  const docs = [
    { etiqueta: 'Comprobante de Póliza', emoji: '📄', url: emision?.poliza },
    { etiqueta: 'Carnet de RCV', emoji: '🪪', url: emision?.carnet },
    { etiqueta: 'Condicionado', emoji: '📑', url: emision?.condicionado },
  ].filter((d) => !!d.url)

  return (
    <View style={{ gap: 14 }}>
      <Tarjeta style={est.exitoCard}>
        <View style={est.exitoIcono}>
          <Text style={{ fontSize: 34 }}>✅</Text>
        </View>
        <Text style={est.exitoTitulo}>¡Póliza Emitida!</Text>
        <Text style={est.exitoSub}>La póliza se generó correctamente. Comparte los documentos con tu cliente.</Text>
        {emision?.numero ? (
          <View style={est.exitoNumeroBox}>
            <Text style={est.exitoNumeroLabel}>Número de Póliza</Text>
            <Text style={est.exitoNumero}>{emision.numero}</Text>
          </View>
        ) : null}
        {emision?.id ? (
          <View style={est.exitoTxFila}>
            <Text style={est.exitoTxK}>ID de Transacción</Text>
            <Text style={est.exitoTxV} numberOfLines={1}>
              {emision.id}
            </Text>
          </View>
        ) : null}
      </Tarjeta>

      {docs.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={est.seccion}>Documentos de la póliza</Text>
          {docs.map((d) => (
            <Pressable key={d.etiqueta} onPress={() => d.url && Linking.openURL(d.url).catch(() => undefined)}>
              <Tarjeta style={est.docCard}>
                <Text style={{ fontSize: 22 }}>{d.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={est.docTitulo}>{d.etiqueta}</Text>
                  <Text style={est.docSub}>Toca para abrir / descargar</Text>
                </View>
                <Text style={est.docFlecha}>⬇</Text>
              </Tarjeta>
            </Pressable>
          ))}
        </View>
      ) : (
        <Alerta tipo="info">
          La póliza fue emitida. Los documentos (cuadro y carnet) estarán disponibles en “Mis Ventas” en unos
          instantes.
        </Alerta>
      )}

      <Boton texto="Nueva venta" onPress={onNuevo} style={{ marginTop: 4 }} />
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
  metodoTitulo: { fontSize: 13, fontWeight: '800', color: color.primary },
  totalCard: { padding: 16, alignItems: 'center', backgroundColor: color.primaryTint, borderColor: color.primaryLight },
  totalLabel: { fontSize: 11.5, fontWeight: '700', color: color.text3, letterSpacing: 0.4 },
  totalValor: { fontSize: 26, fontWeight: '800', color: color.primaryDark, marginTop: 4, letterSpacing: -0.5 },
  metodoBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.white,
  },
  metodoBtnOn: { backgroundColor: color.primary, borderColor: color.primary },
  adTitulo: { fontSize: 13.5, fontWeight: '800', color: color.text },
  apovBox: { marginTop: 12, borderWidth: 1, borderColor: color.borderSoft, borderRadius: 10, overflow: 'hidden' },
  apovFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 12 },
  apovK: { fontSize: 12, color: color.text2 },
  apovV: { fontSize: 12, color: color.text, fontWeight: '600' },
  apovTotalFila: { backgroundColor: color.bgCard, borderTopWidth: 1, borderTopColor: color.borderSoft },
  apovTotalK: { fontSize: 12.5, fontWeight: '800', color: color.text },
  apovTotalV: { fontSize: 12.5, fontWeight: '800', color: color.primaryDark },
  totalEstimado: { padding: 14, marginTop: 10, gap: 6 },
  totalDivider: { height: 1, backgroundColor: color.borderSoft, marginVertical: 4 },
  totalEstK: { fontSize: 14, fontWeight: '800', color: color.text },
  totalEstV: { fontSize: 15, fontWeight: '800', color: color.primaryDark },
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
  radioFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  radioFilaOn: { borderColor: color.primary, backgroundColor: color.primaryLight },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: color.borderInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 99, backgroundColor: color.primary },
  resumenBox: { backgroundColor: color.bgCard, borderRadius: 12, padding: 12, gap: 6 },
  filaResumen: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  filaResumenK: { fontSize: 12, color: color.text3 },
  filaResumenV: { fontSize: 12.5, fontWeight: '700', color: color.text, flexShrink: 1, textAlign: 'right' },
  // Sub-stepper del pago
  pagoSteps: {
    flexDirection: 'row',
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  pagoStepItem: { flex: 1, alignItems: 'center' },
  pagoDot: {
    width: 26, height: 26, borderRadius: 99, backgroundColor: color.bgCard,
    borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center',
  },
  pagoDotOn: { backgroundColor: color.primary, borderColor: color.primary },
  pagoDotHecho: { backgroundColor: color.success, borderColor: color.success },
  pagoDotTxt: { fontSize: 11.5, fontWeight: '800', color: color.text3 },
  pagoStepLabel: { fontSize: 10, color: color.text3, marginTop: 4, textAlign: 'center' },
  descuentoFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  // Éxito
  exitoCard: { padding: 22, alignItems: 'center', gap: 6, backgroundColor: color.primaryTint, borderColor: color.primaryLight },
  exitoIcono: {
    width: 64, height: 64, borderRadius: 99, backgroundColor: color.white,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  exitoTitulo: { fontSize: 20, fontWeight: '800', color: color.primaryDark },
  exitoSub: { fontSize: 12.5, color: color.text2, textAlign: 'center', lineHeight: 18 },
  exitoNumeroBox: { alignItems: 'center', marginTop: 10 },
  exitoNumeroLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, color: color.text3 },
  exitoNumero: { fontSize: 22, fontWeight: '800', color: color.text, letterSpacing: 1 },
  exitoTxFila: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8, maxWidth: '100%' },
  exitoTxK: { fontSize: 11.5, color: color.text3 },
  exitoTxV: { fontSize: 11.5, fontWeight: '700', color: color.text, flexShrink: 1 },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  docTitulo: { fontSize: 13.5, fontWeight: '800', color: color.text },
  docSub: { fontSize: 11, color: color.text3, marginTop: 1 },
  docFlecha: { fontSize: 18, color: color.primary, fontWeight: '800' },
})
