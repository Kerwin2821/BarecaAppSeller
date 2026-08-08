import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { catalogoApi, cascoApi, type CascoPlan } from '../lib/endpoints'
import { mensajeDeError } from '../lib/api'
import { moneda } from '../lib/formato'
import { Dropdown, type OpcionDrop } from './Dropdown'
import { Alerta, Boton, Campo, Pildora, Tarjeta } from './Ui'
import { color } from '../lib/tema'

type Ramo = 'rcv' | 'casco'

interface Vehiculo {
  marcaId: string | null
  marcaNombre?: string
  modeloId: string | null
  modeloNombre?: string
  versionId: string | null
  versionNombre?: string
  versionAnioId: string | null // hoja del catálogo (cat_version_anio) que se guarda en la póliza
  anio?: number
  placa: string
  uso: 'PARTICULAR' | 'COMERCIAL'
}

const PASOS = ['Vehículo', 'Plan', 'Cliente', 'Pago']

const aOpc = (xs: { id: string; nombre: string }[]): OpcionDrop[] =>
  xs.map((x) => ({ valor: x.id, texto: x.nombre }))

/**
 * Asistente de venta. Réplica del new-sale-wizard del portal. El paso de
 * Vehículo usa el catálogo real (cascada marca→modelo→versión→año, endpoints
 * públicos). Los pasos Plan/Cliente/Pago se completan en las siguientes
 * iteraciones (tarifa/prima, staging de cliente y pasarela de pago).
 */
export function NuevaVentaWizard({ ramo: ramoInicial, express = false }: { ramo: Ramo; express?: boolean }) {
  const insets = useSafeAreaInsets()
  const [ramo, setRamo] = useState<Ramo>(ramoInicial)
  const [paso, setPaso] = useState(0)
  const [veh, setVeh] = useState<Vehiculo>({
    marcaId: null,
    modeloId: null,
    versionId: null,
    versionAnioId: null,
    placa: '',
    uso: 'PARTICULAR',
  })

  const [marcas, setMarcas] = useState<OpcionDrop[]>([])
  const [modelos, setModelos] = useState<OpcionDrop[]>([])
  const [versiones, setVersiones] = useState<OpcionDrop[]>([])
  const [anios, setAnios] = useState<OpcionDrop[]>([])
  const [cargando, setCargando] = useState<{ [k: string]: boolean }>({})
  const [error, setError] = useState<string | null>(null)

  // Planes de casco (paso Plan) + selección.
  const [planes, setPlanes] = useState<CascoPlan[]>([])
  const [planId, setPlanId] = useState<number | null>(null)

  const setCarga = (k: string, v: boolean) => setCargando((c) => ({ ...c, [k]: v }))

  // Al entrar al paso Plan con Casco, carga los planes reales del vehículo.
  useEffect(() => {
    if (paso !== 1 || ramo !== 'casco' || !veh.versionAnioId) return
    let vivo = true
    setCarga('planes', true)
    setError(null)
    setPlanes([])
    cascoApi
      .planes(veh.versionAnioId)
      .then((r) => vivo && setPlanes(r ?? []))
      .catch((e) => vivo && setError(mensajeDeError(e)))
      .finally(() => vivo && setCarga('planes', false))
    return () => {
      vivo = false
    }
  }, [paso, ramo, veh.versionAnioId])

  // Marcas al montar.
  useEffect(() => {
    let vivo = true
    setCarga('marcas', true)
    catalogoApi
      .marcas()
      .then((r) => vivo && setMarcas(aOpc(r ?? [])))
      .catch((e) => vivo && setError(mensajeDeError(e)))
      .finally(() => vivo && setCarga('marcas', false))
    return () => {
      vivo = false
    }
  }, [])

  const elegirMarca = useCallback((marcaId: string) => {
    setVeh((v) => ({ ...v, marcaId, marcaNombre: marcas.find((m) => m.valor === marcaId)?.texto, modeloId: null, versionId: null, versionAnioId: null }))
    setModelos([])
    setVersiones([])
    setAnios([])
    setCarga('modelos', true)
    catalogoApi
      .modelos(marcaId)
      .then((r) => setModelos(aOpc(r ?? [])))
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCarga('modelos', false))
  }, [marcas])

  const elegirModelo = useCallback((modeloId: string) => {
    setVeh((v) => ({ ...v, modeloId, modeloNombre: modelos.find((m) => m.valor === modeloId)?.texto, versionId: null, versionAnioId: null }))
    setVersiones([])
    setAnios([])
    setCarga('versiones', true)
    catalogoApi
      .versiones(modeloId)
      .then((r) => setVersiones(aOpc(r ?? [])))
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCarga('versiones', false))
  }, [modelos])

  const elegirVersion = useCallback((versionId: string) => {
    setVeh((v) => ({ ...v, versionId, versionNombre: versiones.find((m) => m.valor === versionId)?.texto, versionAnioId: null }))
    setAnios([])
    setCarga('anios', true)
    catalogoApi
      .anios(versionId)
      .then((r) => setAnios((r ?? []).map((a) => ({ valor: a.id, texto: String(a.anio) }))))
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCarga('anios', false))
  }, [versiones])

  const elegirAnio = useCallback((versionAnioId: string) => {
    const opt = anios.find((a) => a.valor === versionAnioId)
    setVeh((v) => ({ ...v, versionAnioId, anio: opt ? Number(opt.texto) : undefined }))
  }, [anios])

  const vehiculoListo = !!veh.versionAnioId && veh.placa.trim().length >= 4

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
              {i < PASOS.length - 1 ? <View style={[est.stepLinea, hecho && { backgroundColor: color.primary }]} /> : null}
            </View>
          )
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={est.titulo}>
          {express ? 'Venta Rápida RCV' : ramo === 'casco' ? 'Nueva Venta · Casco' : 'Nueva Venta · RCV'}
        </Text>

        {error ? (
          <View style={{ marginBottom: 12 }}>
            <Alerta tipo="error">{error}</Alerta>
          </View>
        ) : null}

        {paso === 0 ? (
          <Tarjeta style={{ padding: 18, gap: 14 }}>
            {!express ? (
              <View>
                <Text style={est.subEtiqueta}>Ramo</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['rcv', 'casco'] as const).map((r) => (
                    <Boton
                      key={r}
                      texto={r === 'rcv' ? 'RCV' : 'Casco'}
                      variante={ramo === r ? 'primary' : 'soft'}
                      onPress={() => setRamo(r)}
                      style={{ flex: 1 }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            <Text style={est.pasoTitulo}>Datos del vehículo</Text>
            <Dropdown etiqueta="Marca" opciones={marcas} valor={veh.marcaId} onCambiar={elegirMarca} cargando={cargando.marcas} />
            <Dropdown etiqueta="Modelo" opciones={modelos} valor={veh.modeloId} onCambiar={elegirModelo} cargando={cargando.modelos} deshabilitado={!veh.marcaId} />
            <Dropdown etiqueta="Versión" opciones={versiones} valor={veh.versionId} onCambiar={elegirVersion} cargando={cargando.versiones} deshabilitado={!veh.modeloId} />
            <Dropdown etiqueta="Año" opciones={anios} valor={veh.versionAnioId} onCambiar={elegirAnio} cargando={cargando.anios} deshabilitado={!veh.versionId} />
            <Campo
              etiqueta="Placa"
              placeholder="AB123CD"
              autoCapitalize="characters"
              value={veh.placa}
              onChangeText={(t) => setVeh((v) => ({ ...v, placa: t.toUpperCase() }))}
            />
            <View>
              <Text style={est.subEtiqueta}>Uso</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['PARTICULAR', 'COMERCIAL'] as const).map((u) => (
                  <Boton
                    key={u}
                    texto={u === 'PARTICULAR' ? 'Particular' : 'Comercial'}
                    variante={veh.uso === u ? 'primary' : 'soft'}
                    onPress={() => setVeh((v) => ({ ...v, uso: u }))}
                    style={{ flex: 1 }}
                  />
                ))}
              </View>
            </View>

            <Boton
              texto="Continuar a Plan →"
              onPress={() => setPaso(1)}
              disabled={!vehiculoListo}
              style={{ marginTop: 6 }}
            />
          </Tarjeta>
        ) : paso === 1 && ramo === 'casco' ? (
          // ── Paso Plan · Casco (funcional, planes con prima real) ──────
          <View style={{ gap: 12 }}>
            <Text style={est.resumen}>
              {[veh.marcaNombre, veh.modeloNombre, veh.versionNombre, veh.anio].filter(Boolean).join(' ')} · {veh.placa}
            </Text>
            {cargando.planes ? (
              <Tarjeta style={{ padding: 20 }}>
                <Text style={est.pendiente}>Consultando planes de casco…</Text>
              </Tarjeta>
            ) : planes.length === 0 ? (
              <Tarjeta style={{ padding: 18 }}>
                <Text style={est.pendiente}>No hay planes de casco para este vehículo.</Text>
              </Tarjeta>
            ) : (
              planes.map((pl) => {
                const activo = pl.planId === planId
                return (
                  <Pressable key={pl.planId} onPress={() => setPlanId(pl.planId)}>
                    <Tarjeta style={[{ padding: 16 }, activo && { borderColor: color.primary, borderWidth: 2 }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={est.planNombre}>{pl.planNombre}</Text>
                        {activo ? <Pildora color={color.primary} texto="Seleccionado" /> : null}
                      </View>
                      <Text style={est.planPrima}>{moneda(pl.totalPrimaAnual, '$')} <Text style={est.planPrimaSub}>/ año</Text></Text>
                      <Text style={est.planSuma}>Suma asegurada: {moneda(pl.sumaAsegurada, '$')}</Text>
                      <View style={{ marginTop: 8, gap: 3 }}>
                        {pl.coberturas.slice(0, 5).map((c) => (
                          <View key={c.coberturaId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={est.covNombre}>{c.nombre}</Text>
                            <Text style={est.covPrima}>{moneda(c.prima, '$')}</Text>
                          </View>
                        ))}
                      </View>
                    </Tarjeta>
                  </Pressable>
                )
              })
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Boton texto="← Atrás" variante="soft" onPress={() => setPaso(0)} style={{ flex: 1 }} />
              <Boton texto="Continuar a Cliente →" onPress={() => setPaso(2)} disabled={planId === null} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Tarjeta style={{ padding: 18 }}>
            <View style={est.badge}>
              <Text style={est.badgeTexto}>SIGUIENTE ITERACIÓN</Text>
            </View>
            <Text style={est.pasoTitulo}>{PASOS[paso]}</Text>
            <Text style={est.resumen}>
              Vehículo seleccionado:{' '}
              <Text style={{ fontWeight: '800', color: color.text }}>
                {[veh.marcaNombre, veh.modeloNombre, veh.versionNombre, veh.anio].filter(Boolean).join(' ')} · {veh.placa}
              </Text>
            </Text>
            <Text style={est.pendiente}>
              {paso === 1
                ? 'Selección de plan RCV y cálculo de prima (tarifa/coberturas por clase, validación SUDEASEG y APOV).'
                : paso === 2
                  ? 'Datos del cliente/conductor con OCR de cédula y staging en el micro de clientes.'
                  : 'Registro de pago (pago móvil / referencia) y emisión con cuadro y carnet.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Boton texto="← Atrás" variante="soft" onPress={() => setPaso((p) => Math.max(0, p - 1))} style={{ flex: 1 }} />
              {paso < PASOS.length - 1 ? (
                <Boton texto="Siguiente →" variante="soft" onPress={() => setPaso((p) => p + 1)} style={{ flex: 1 }} />
              ) : null}
            </View>
          </Tarjeta>
        )}
      </ScrollView>
    </View>
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
  stepItem: { flex: 1, alignItems: 'center', position: 'relative' },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 99,
    backgroundColor: color.bgCard,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumActivo: { backgroundColor: color.primary, borderColor: color.primary },
  stepNumHecho: { backgroundColor: color.success, borderColor: color.success },
  stepNumTexto: { fontSize: 12, fontWeight: '800', color: color.text3 },
  stepLabel: { fontSize: 10.5, color: color.text3, marginTop: 4 },
  stepLinea: { position: 'absolute', top: 14, left: '60%', right: '-40%', height: 2, backgroundColor: color.border },
  titulo: { fontSize: 18, fontWeight: '800', color: color.text, marginBottom: 14, letterSpacing: -0.3 },
  pasoTitulo: { fontSize: 15, fontWeight: '800', color: color.text },
  subEtiqueta: { fontSize: 12, fontWeight: '700', color: color.text2, marginBottom: 8 },
  badge: { alignSelf: 'flex-start', backgroundColor: color.warningBg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, marginBottom: 10 },
  badgeTexto: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4, color: color.amber },
  resumen: { fontSize: 12.5, color: color.text2, marginTop: 2, lineHeight: 19 },
  pendiente: { fontSize: 12.5, color: color.text2, marginTop: 10, lineHeight: 19 },
  planNombre: { fontSize: 15, fontWeight: '800', color: color.text },
  planPrima: { fontSize: 20, fontWeight: '800', color: color.primary, marginTop: 6 },
  planPrimaSub: { fontSize: 12, fontWeight: '600', color: color.text3 },
  planSuma: { fontSize: 12, color: color.text2, marginTop: 2 },
  covNombre: { fontSize: 11.5, color: color.text2 },
  covPrima: { fontSize: 11.5, color: color.text, fontWeight: '600' },
})
