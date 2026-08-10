import { useCallback, useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { catalogoApi, geoApi, type GeoOpcion } from '../lib/endpoints'
import { mensajeDeError } from '../lib/api'
import { ocrCarnet, ocrCedula, type FuenteImagen } from '../lib/ocr'
import { fechaCorta, isoDia } from '../lib/formato'
import { Dropdown, type OpcionDrop } from './Dropdown'
import { Spinner } from './Estados'
import { useToast } from './Toast'
import { Alerta, Boton, Campo, Tarjeta } from './Ui'
import { color } from '../lib/tema'

export interface DatosCliente {
  tipoDoc: string
  cedula: string
  nombres: string
  apellidos: string
  genero: string
  fechaNacimiento: string | null
  // Contacto
  correo: string
  telefono: string
  estadoId: number | null
  municipioId: number | null
  ciudadId: number | null
  // Vehículo (autocompletado por el carnet de circulación / editable)
  placa: string
  serialNiv: string
  serialMotor: string
  color: string
  marca: string
  modelo: string
  version: string
  anio: number | null
  // Id del catálogo (cat_version_anio) cuando se elige por los desplegables.
  catVersionAnioId: number | null
}

const TIPOS_DOC: OpcionDrop[] = [
  { valor: 'V', texto: 'V — Venezolano' },
  { valor: 'E', texto: 'E — Extranjero' },
  { valor: 'J', texto: 'J — Jurídico (RIF)' },
  { valor: 'P', texto: 'P — Pasaporte' },
]
const GENEROS: OpcionDrop[] = [
  { valor: 'M', texto: 'Masculino' },
  { valor: 'F', texto: 'Femenino' },
]

const aOpc = (xs: GeoOpcion[]): OpcionDrop[] => xs.map((x) => ({ valor: String(x.id), texto: x.nombre }))

/** Normaliza la respuesta geo del BFF (array plano o {content}/{data}). */
function aGeo(r: any): GeoOpcion[] {
  const arr = Array.isArray(r) ? r : (r?.content ?? r?.data ?? [])
  return (arr as any[]).filter((x) => x && x.id != null && x.nombre)
}

/**
 * Mensaje amable para fallos de OCR. Si el servicio no respondió (502/5xx/timeout)
 * el vendedor puede seguir a mano; si es otra cosa (permiso, foto ilegible) se
 * muestra el detalle real. El OCR es autocompletado: nunca bloquea la venta.
 */
function mensajeOcr(e: unknown, cual: string): string {
  const raw = mensajeDeError(e)
  if (/50[0-9]|bad gateway|gateway|status code 5|no respond|timeout|tiempo|Failed to fetch|conect/i.test(raw)) {
    return `No pudimos leer ${cual}: el servicio de OCR no está disponible ahora. Ingresa los datos manualmente.`
  }
  return raw
}

/**
 * Paso 2 del wizard — Datos del Cliente (tomador). Réplica del client-data-step:
 * documento, nombres, género, fecha de nacimiento, contacto, catálogo de
 * vehículo y dirección (estado/municipio/ciudad). Incluye captura por OCR de la
 * cédula y el carnet de circulación (cámara/galería).
 */
export function PasoCliente({
  onAtras,
  onContinuar,
  mostrarVehiculo = true,
}: {
  onAtras: () => void
  onContinuar: (datos: DatosCliente) => void
  /** El vehículo solo aplica a RCV/Casco; el funerario lo oculta. */
  mostrarVehiculo?: boolean
}) {
  const { avisar } = useToast()
  const [d, setD] = useState<DatosCliente>({
    tipoDoc: 'V',
    cedula: '',
    nombres: '',
    apellidos: '',
    genero: '',
    fechaNacimiento: null,
    correo: '',
    telefono: '',
    estadoId: null,
    municipioId: null,
    ciudadId: null,
    placa: '',
    serialNiv: '',
    serialMotor: '',
    color: '',
    marca: '',
    modelo: '',
    version: '',
    anio: null,
    catVersionAnioId: null,
  })
  const set = <K extends keyof DatosCliente>(k: K, v: DatosCliente[K]) => setD((x) => ({ ...x, [k]: v }))
  // Cargas de OCR independientes: la cédula y el carnet pueden leerse a la vez.
  const [ocrCedulaCargando, setOcrCedulaCargando] = useState(false)
  const [ocrCarnetCargando, setOcrCarnetCargando] = useState(false)
  const [motorIgual, setMotorIgual] = useState(false)

  // "Igual a Carrocería": el serial del motor copia el de la carrocería (NIV).
  const alternarMotorIgual = (v: boolean) => {
    setMotorIgual(v)
    if (v) setD((x) => ({ ...x, serialMotor: x.serialNiv }))
  }

  const capturarCedula = useCallback(async (fuente: FuenteImagen) => {
    setOcrCedulaCargando(true)
    try {
      const r = await ocrCedula(fuente)
      if (r) {
        setD((x) => ({
          ...x,
          nombres: r.nombres ?? x.nombres,
          apellidos: r.apellidos ?? x.apellidos,
          cedula: (r.numeroDocumento ?? x.cedula).replace(/[^0-9]/g, ''),
          genero: (r.genero ?? '').toUpperCase().startsWith('F') ? 'F' : r.genero ? 'M' : x.genero,
          fechaNacimiento: r.fechaNacimiento ?? x.fechaNacimiento,
        }))
        avisar('Cédula leída. Verifica los datos.', 'ok')
      }
    } catch (e) {
      avisar(mensajeOcr(e, 'la cédula'), 'error')
    } finally {
      setOcrCedulaCargando(false)
    }
  }, [avisar])

  const capturarCarnet = useCallback(async (fuente: FuenteImagen) => {
    setOcrCarnetCargando(true)
    try {
      const r = await ocrCarnet(fuente)
      if (r) {
        setD((x) => {
          const serialNiv = r.serialNiv ?? r.serialCarroceria ?? x.serialNiv
          return {
            ...x,
            placa: (r.placa ?? x.placa).toUpperCase(),
            serialNiv,
            serialMotor: motorIgual ? serialNiv : (r.serialMotor ?? x.serialMotor),
            color: r.color ?? x.color,
            marca: r.marca ?? x.marca,
            modelo: r.modelo ?? x.modelo,
          }
        })
        avisar('Carnet leído. Verifica placa y seriales.', 'ok')
      }
    } catch (e) {
      avisar(mensajeOcr(e, 'el carnet'), 'error')
    } finally {
      setOcrCarnetCargando(false)
    }
  }, [avisar, motorIgual])

  const [estados, setEstados] = useState<GeoOpcion[]>([])
  const [municipios, setMunicipios] = useState<GeoOpcion[]>([])
  const [ciudades, setCiudades] = useState<GeoOpcion[]>([])
  const [cargando, setCargando] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [pickerFecha, setPickerFecha] = useState(false)
  const setCarga = (k: string, v: boolean) => setCargando((c) => ({ ...c, [k]: v }))

  // Catálogo de vehículos (cascada marca → modelo → versión → año).
  const [marcasCat, setMarcasCat] = useState<{ id: string; nombre: string }[]>([])
  const [modelosCat, setModelosCat] = useState<{ id: string; nombre: string }[]>([])
  const [versionesCat, setVersionesCat] = useState<{ id: string; nombre: string }[]>([])
  const [aniosCat, setAniosCat] = useState<{ id: string; anio: number }[]>([])
  const [marcaId, setMarcaId] = useState<string | null>(null)
  const [modeloId, setModeloId] = useState<string | null>(null)
  const [versionId, setVersionId] = useState<string | null>(null)

  useEffect(() => {
    setCarga('estados', true)
    geoApi
      .estados()
      .then((r) => setEstados(aGeo(r)))
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCarga('estados', false))
    // Marcas del catálogo (para el desplegable de vehículo).
    setCarga('marcas', true)
    catalogoApi
      .marcas()
      .then((r) => setMarcasCat(Array.isArray(r) ? r : ((r as any)?.data ?? [])))
      .catch(() => undefined)
      .finally(() => setCarga('marcas', false))
  }, [])

  const elegirMarca = useCallback((id: string) => {
    const nom = marcasCat.find((m) => m.id === id)?.nombre ?? ''
    setMarcaId(id)
    setModeloId(null)
    setVersionId(null)
    setModelosCat([])
    setVersionesCat([])
    setAniosCat([])
    setD((x) => ({ ...x, marca: nom, modelo: '', version: '', anio: null, catVersionAnioId: null }))
    setCarga('modelos', true)
    catalogoApi
      .modelos(id)
      .then((r) => setModelosCat(Array.isArray(r) ? r : ((r as any)?.data ?? [])))
      .catch(() => undefined)
      .finally(() => setCarga('modelos', false))
  }, [marcasCat])

  const elegirModelo = useCallback((id: string) => {
    const nom = modelosCat.find((m) => m.id === id)?.nombre ?? ''
    setModeloId(id)
    setVersionId(null)
    setVersionesCat([])
    setAniosCat([])
    setD((x) => ({ ...x, modelo: nom, version: '', anio: null, catVersionAnioId: null }))
    setCarga('versiones', true)
    catalogoApi
      .versiones(id)
      .then((r) => setVersionesCat(Array.isArray(r) ? r : ((r as any)?.data ?? [])))
      .catch(() => undefined)
      .finally(() => setCarga('versiones', false))
  }, [modelosCat])

  const elegirVersion = useCallback((id: string) => {
    const nom = versionesCat.find((v) => v.id === id)?.nombre ?? ''
    setVersionId(id)
    setAniosCat([])
    setD((x) => ({ ...x, version: nom, anio: null, catVersionAnioId: null }))
    setCarga('anios', true)
    catalogoApi
      .anios(id)
      .then((r) => setAniosCat(Array.isArray(r) ? r : ((r as any)?.data ?? [])))
      .catch(() => undefined)
      .finally(() => setCarga('anios', false))
  }, [versionesCat])

  const elegirAnio = useCallback((idStr: string) => {
    const opt = aniosCat.find((a) => String(a.id) === idStr)
    setD((x) => ({ ...x, anio: opt?.anio ?? null, catVersionAnioId: opt ? Number(opt.id) : null }))
  }, [aniosCat])

  const elegirEstado = useCallback((idStr: string) => {
    const id = Number(idStr)
    set('estadoId', id)
    set('municipioId', null)
    set('ciudadId', null)
    setMunicipios([])
    setCiudades([])
    setCarga('mun', true)
    geoApi.municipios(id).then((r) => setMunicipios(aGeo(r))).catch(() => undefined).finally(() => setCarga('mun', false))
    setCarga('ciu', true)
    geoApi.ciudades(id).then((r) => setCiudades(aGeo(r))).catch(() => undefined).finally(() => setCarga('ciu', false))
  }, [])

  const listo =
    d.cedula.trim().length >= 5 &&
    d.nombres.trim().length >= 2 &&
    d.apellidos.trim().length >= 2 &&
    !!d.genero &&
    (d.correo.includes('@') || d.telefono.length >= 7) &&
    !!d.estadoId

  const fechaNac = d.fechaNacimiento ? new Date(`${d.fechaNacimiento}T12:00:00`) : new Date(2000, 0, 1)

  return (
    <View style={{ gap: 12 }}>
      {/* ── Captura con OCR ──────────────────────────────────── */}
      <Tarjeta style={{ padding: 18, gap: 12 }}>
        <Text style={est.titulo}>Captura con OCR</Text>
        <Text style={est.hint}>Toma o sube una foto y autocompletamos los datos.</Text>
        <ZonaOCR
          etiqueta="Documento de identidad"
          detalle="Cédula / RIF del tomador"
          cargando={ocrCedulaCargando}
          onCapturar={capturarCedula}
        />
        {mostrarVehiculo ? (
          <ZonaOCR
            etiqueta="Carnet de circulación"
            detalle="Extrae placa, seriales y color"
            cargando={ocrCarnetCargando}
            onCapturar={capturarCarnet}
          />
        ) : null}
      </Tarjeta>

      <Tarjeta style={{ padding: 18, gap: 14 }}>
        <Text style={est.titulo}>Datos del Tomador</Text>
        {error ? <Alerta tipo="error">{error}</Alerta> : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 120 }}>
            <Dropdown etiqueta="Tipo" opciones={TIPOS_DOC} valor={d.tipoDoc} onCambiar={(v) => set('tipoDoc', v)} />
          </View>
          <Campo
            etiqueta="Cédula / RIF"
            placeholder="12345678"
            keyboardType="number-pad"
            value={d.cedula}
            onChangeText={(t) => set('cedula', t.replace(/[^0-9]/g, ''))}
            style={{ flex: 1 }}
          />
        </View>

        <Campo etiqueta="Nombres" placeholder="Nombres" value={d.nombres} onChangeText={(t) => set('nombres', t)} />
        <Campo etiqueta="Apellidos" placeholder="Apellidos" value={d.apellidos} onChangeText={(t) => set('apellidos', t)} />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Dropdown etiqueta="Género" opciones={GENEROS} valor={d.genero || null} onCambiar={(v) => set('genero', v)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={est.label}>Fecha de nacimiento</Text>
            <Pressable onPress={() => setPickerFecha(true)} style={est.fecha}>
              <Text style={{ fontSize: 13.5, color: d.fechaNacimiento ? color.text : color.text4 }}>
                {d.fechaNacimiento ? fechaCorta(fechaNac) : 'dd/mm/aaaa'}
              </Text>
            </Pressable>
            {pickerFecha && (
              <DateTimePicker
                value={fechaNac}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(ev, sel) => {
                  setPickerFecha(false)
                  if (ev.type !== 'dismissed' && sel) set('fechaNacimiento', isoDia(sel))
                }}
              />
            )}
          </View>
        </View>
      </Tarjeta>

      <Tarjeta style={{ padding: 18, gap: 14 }}>
        <Text style={est.titulo}>Datos de Contacto</Text>
        <Text style={est.hint}>Para enviar la póliza y notificaciones al cliente.</Text>
        <Campo
          etiqueta="Correo electrónico"
          placeholder="cliente@correo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={d.correo}
          onChangeText={(t) => set('correo', t.trim())}
        />
        <Campo
          etiqueta="Teléfono"
          placeholder="04141234567"
          keyboardType="phone-pad"
          value={d.telefono}
          onChangeText={(t) => set('telefono', t.replace(/[^0-9]/g, ''))}
        />
      </Tarjeta>

      {mostrarVehiculo ? (
      <Tarjeta style={{ padding: 18, gap: 14 }}>
        <Text style={est.titulo}>Datos del Vehículo</Text>
        <Text style={est.hint}>Selecciona el vehículo del catálogo; los seriales vienen del carnet.</Text>
        {marcasCat.length > 0 || cargando.marcas ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Dropdown
                  etiqueta="Marca"
                  placeholder="Marca"
                  opciones={marcasCat.map((m) => ({ valor: m.id, texto: m.nombre }))}
                  valor={marcaId}
                  onCambiar={elegirMarca}
                  cargando={cargando.marcas}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Dropdown
                  etiqueta="Modelo"
                  placeholder="Modelo"
                  opciones={modelosCat.map((m) => ({ valor: m.id, texto: m.nombre }))}
                  valor={modeloId}
                  onCambiar={elegirModelo}
                  cargando={cargando.modelos}
                  deshabilitado={!marcaId}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1.4 }}>
                <Dropdown
                  etiqueta="Versión"
                  placeholder="Versión"
                  opciones={versionesCat.map((v) => ({ valor: v.id, texto: v.nombre }))}
                  valor={versionId}
                  onCambiar={elegirVersion}
                  cargando={cargando.versiones}
                  deshabilitado={!modeloId}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Dropdown
                  etiqueta="Año"
                  placeholder="Año"
                  opciones={aniosCat.map((a) => ({ valor: String(a.id), texto: String(a.anio) }))}
                  valor={d.catVersionAnioId ? String(d.catVersionAnioId) : null}
                  onCambiar={elegirAnio}
                  cargando={cargando.anios}
                  deshabilitado={!versionId}
                />
              </View>
            </View>
          </>
        ) : (
          // Fallback si el catálogo no cargó: captura libre de marca/modelo.
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Campo etiqueta="Marca" placeholder="Marca" value={d.marca} onChangeText={(t) => set('marca', t)} style={{ flex: 1 }} />
            <Campo etiqueta="Modelo" placeholder="Modelo" value={d.modelo} onChangeText={(t) => set('modelo', t)} style={{ flex: 1 }} />
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Campo etiqueta="Placa" placeholder="AB123CD" autoCapitalize="characters" value={d.placa} onChangeText={(t) => set('placa', t.toUpperCase())} style={{ flex: 1 }} />
          <Campo etiqueta="Color" placeholder="Color" value={d.color} onChangeText={(t) => set('color', t)} style={{ flex: 1 }} />
        </View>
        <Campo
          etiqueta="Serial de carrocería / NIV"
          placeholder="Serial NIV"
          autoCapitalize="characters"
          value={d.serialNiv}
          onChangeText={(t) => {
            const val = t.toUpperCase()
            setD((x) => ({ ...x, serialNiv: val, serialMotor: motorIgual ? val : x.serialMotor }))
          }}
        />
        <View>
          <View style={est.serialLabel}>
            <Text style={est.label}>Serial del motor</Text>
            <Pressable onPress={() => alternarMotorIgual(!motorIgual)} style={est.igualBtn}>
              <View style={[est.miniCheck, motorIgual && est.miniCheckOn]}>
                {motorIgual ? <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✓</Text> : null}
              </View>
              <Text style={{ fontSize: 11.5, color: color.primary, fontWeight: '700' }}>Igual a Carrocería</Text>
            </Pressable>
          </View>
          <Campo
            placeholder="Serial motor"
            autoCapitalize="characters"
            editable={!motorIgual}
            value={d.serialMotor}
            onChangeText={(t) => set('serialMotor', t.toUpperCase())}
          />
        </View>
      </Tarjeta>
      ) : null}

      <Tarjeta style={{ padding: 18, gap: 14 }}>
        <Text style={est.titulo}>Dirección del Asegurado</Text>
        <Dropdown etiqueta="Estado" placeholder="Selecciona un estado" opciones={aOpc(estados)} valor={d.estadoId ? String(d.estadoId) : null} onCambiar={elegirEstado} cargando={cargando.estados} />
        <Dropdown etiqueta="Municipio" placeholder="Selecciona un municipio" opciones={aOpc(municipios)} valor={d.municipioId ? String(d.municipioId) : null} onCambiar={(v) => set('municipioId', Number(v))} cargando={cargando.mun} deshabilitado={!d.estadoId} />
        <Dropdown etiqueta="Ciudad" placeholder="Selecciona una ciudad" opciones={aOpc(ciudades)} valor={d.ciudadId ? String(d.ciudadId) : null} onCambiar={(v) => set('ciudadId', Number(v))} cargando={cargando.ciu} deshabilitado={!d.estadoId} />
      </Tarjeta>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Boton texto="← Atrás" variante="soft" onPress={onAtras} style={{ flex: 1 }} />
        <Boton texto={mostrarVehiculo ? 'Continuar — Conductor' : 'Continuar — Pago'} onPress={() => onContinuar(d)} disabled={!listo} style={{ flex: 1.4 }} />
      </View>
    </View>
  )
}

/** Zona de captura de un documento: cámara o galería, con estado de carga. */
function ZonaOCR({
  etiqueta,
  detalle,
  cargando,
  onCapturar,
}: {
  etiqueta: string
  detalle: string
  cargando: boolean
  onCapturar: (fuente: FuenteImagen) => void
}) {
  return (
    <View style={est.zona}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={est.zonaEtiqueta}>{etiqueta}</Text>
        <Text style={est.zonaDetalle}>{detalle}</Text>
      </View>
      {cargando ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Spinner size={16} />
          <Text style={est.zonaLeyendo}>Leyendo…</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => onCapturar('camara')} style={est.zonaBtn}>
            <Text style={est.zonaBtnTexto}>📷 Cámara</Text>
          </Pressable>
          <Pressable onPress={() => onCapturar('galeria')} style={est.zonaBtn}>
            <Text style={est.zonaBtnTexto}>🖼️ Galería</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const est = StyleSheet.create({
  titulo: { fontSize: 15, fontWeight: '800', color: color.text },
  hint: { fontSize: 12, color: color.text3, lineHeight: 16 },
  label: { fontSize: 12, fontWeight: '700', color: color.text2, marginBottom: 6 },
  fecha: {
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 13,
    backgroundColor: color.white,
  },
  zona: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.borderInput,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  zonaEtiqueta: { fontSize: 13, fontWeight: '700', color: color.text },
  zonaDetalle: { fontSize: 11, color: color.text3, marginTop: 1 },
  zonaLeyendo: { fontSize: 12, color: color.text2 },
  zonaBtn: {
    backgroundColor: color.primaryLight,
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  zonaBtnTexto: { fontSize: 11.5, fontWeight: '700', color: color.primaryDark },
  serialLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  igualBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniCheck: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: color.borderInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCheckOn: { backgroundColor: color.primary, borderColor: color.primary },
})
