import { useCallback, useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { geoApi, type GeoOpcion } from '../lib/endpoints'
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
 * Paso 2 del wizard — Datos del Cliente (tomador). Réplica del client-data-step:
 * documento, nombres, género, fecha de nacimiento y dirección (estado/municipio/
 * ciudad desde el micro de clientes). La subida de cédula/carnet con OCR llega
 * en la próxima iteración (requiere selector de imágenes).
 */
export function PasoCliente({
  onAtras,
  onContinuar,
}: {
  onAtras: () => void
  onContinuar: (datos: DatosCliente) => void
}) {
  const { avisar } = useToast()
  const [d, setD] = useState<DatosCliente>({
    tipoDoc: 'V',
    cedula: '',
    nombres: '',
    apellidos: '',
    genero: '',
    fechaNacimiento: null,
    estadoId: null,
    municipioId: null,
    ciudadId: null,
    placa: '',
    serialNiv: '',
    serialMotor: '',
    color: '',
    marca: '',
    modelo: '',
  })
  const set = <K extends keyof DatosCliente>(k: K, v: DatosCliente[K]) => setD((x) => ({ ...x, [k]: v }))
  const [ocrCargando, setOcrCargando] = useState<'' | 'cedula' | 'carnet'>('')
  const [motorIgual, setMotorIgual] = useState(false)

  // "Igual a Carrocería": el serial del motor copia el de la carrocería (NIV).
  const alternarMotorIgual = (v: boolean) => {
    setMotorIgual(v)
    if (v) setD((x) => ({ ...x, serialMotor: x.serialNiv }))
  }

  const capturarCedula = useCallback(async (fuente: FuenteImagen) => {
    setOcrCargando('cedula')
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
      avisar(mensajeDeError(e), 'error')
    } finally {
      setOcrCargando('')
    }
  }, [avisar])

  const capturarCarnet = useCallback(async (fuente: FuenteImagen) => {
    setOcrCargando('carnet')
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
      avisar(mensajeDeError(e), 'error')
    } finally {
      setOcrCargando('')
    }
  }, [avisar, motorIgual])

  const [estados, setEstados] = useState<GeoOpcion[]>([])
  const [municipios, setMunicipios] = useState<GeoOpcion[]>([])
  const [ciudades, setCiudades] = useState<GeoOpcion[]>([])
  const [cargando, setCargando] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [pickerFecha, setPickerFecha] = useState(false)
  const setCarga = (k: string, v: boolean) => setCargando((c) => ({ ...c, [k]: v }))

  useEffect(() => {
    setCarga('estados', true)
    geoApi
      .estados()
      .then((r) => setEstados(aGeo(r)))
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCarga('estados', false))
  }, [])

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
          cargando={ocrCargando === 'cedula'}
          onCapturar={capturarCedula}
        />
        <ZonaOCR
          etiqueta="Carnet de circulación"
          detalle="Extrae placa, seriales y color"
          cargando={ocrCargando === 'carnet'}
          onCapturar={capturarCarnet}
        />
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
        <Text style={est.titulo}>Datos del Vehículo</Text>
        <Text style={est.hint}>Autocompletados del carnet; puedes corregirlos.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Campo etiqueta="Placa" placeholder="AB123CD" autoCapitalize="characters" value={d.placa} onChangeText={(t) => set('placa', t.toUpperCase())} style={{ flex: 1 }} />
          <Campo etiqueta="Color" placeholder="Color" value={d.color} onChangeText={(t) => set('color', t)} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Campo etiqueta="Marca" placeholder="Marca" value={d.marca} onChangeText={(t) => set('marca', t)} style={{ flex: 1 }} />
          <Campo etiqueta="Modelo" placeholder="Modelo" value={d.modelo} onChangeText={(t) => set('modelo', t)} style={{ flex: 1 }} />
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

      <Tarjeta style={{ padding: 18, gap: 14 }}>
        <Text style={est.titulo}>Dirección del Asegurado</Text>
        <Dropdown etiqueta="Estado" placeholder="Selecciona un estado" opciones={aOpc(estados)} valor={d.estadoId ? String(d.estadoId) : null} onCambiar={elegirEstado} cargando={cargando.estados} />
        <Dropdown etiqueta="Municipio" placeholder="Selecciona un municipio" opciones={aOpc(municipios)} valor={d.municipioId ? String(d.municipioId) : null} onCambiar={(v) => set('municipioId', Number(v))} cargando={cargando.mun} deshabilitado={!d.estadoId} />
        <Dropdown etiqueta="Ciudad" placeholder="Selecciona una ciudad" opciones={aOpc(ciudades)} valor={d.ciudadId ? String(d.ciudadId) : null} onCambiar={(v) => set('ciudadId', Number(v))} cargando={cargando.ciu} deshabilitado={!d.estadoId} />
      </Tarjeta>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Boton texto="← Atrás" variante="soft" onPress={onAtras} style={{ flex: 1 }} />
        <Boton texto="Continuar — Conductor" onPress={() => onContinuar(d)} disabled={!listo} style={{ flex: 1.4 }} />
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
