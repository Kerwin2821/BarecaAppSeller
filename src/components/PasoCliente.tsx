import { useCallback, useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { geoApi, type GeoOpcion } from '../lib/endpoints'
import { mensajeDeError } from '../lib/api'
import { fechaCorta, isoDia } from '../lib/formato'
import { Dropdown, type OpcionDrop } from './Dropdown'
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
  })
  const set = <K extends keyof DatosCliente>(k: K, v: DatosCliente[K]) => setD((x) => ({ ...x, [k]: v }))

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
      .then((r) => setEstados(r ?? []))
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
    geoApi.municipios(id).then((r) => setMunicipios(r ?? [])).catch(() => undefined).finally(() => setCarga('mun', false))
    setCarga('ciu', true)
    geoApi.ciudades(id).then((r) => setCiudades(r ?? [])).catch(() => undefined).finally(() => setCarga('ciu', false))
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
        <Text style={est.titulo}>Dirección del Asegurado</Text>
        <Dropdown etiqueta="Estado" placeholder="Selecciona un estado" opciones={aOpc(estados)} valor={d.estadoId ? String(d.estadoId) : null} onCambiar={elegirEstado} cargando={cargando.estados} />
        <Dropdown etiqueta="Municipio" placeholder="Selecciona un municipio" opciones={aOpc(municipios)} valor={d.municipioId ? String(d.municipioId) : null} onCambiar={(v) => set('municipioId', Number(v))} cargando={cargando.mun} deshabilitado={!d.estadoId} />
        <Dropdown etiqueta="Ciudad" placeholder="Selecciona una ciudad" opciones={aOpc(ciudades)} valor={d.ciudadId ? String(d.ciudadId) : null} onCambiar={(v) => set('ciudadId', Number(v))} cargando={cargando.ciu} deshabilitado={!d.estadoId} />
      </Tarjeta>

      <Alerta tipo="info">
        La captura de cédula y carnet de circulación con OCR (autocompleta placa, seriales y color) llega en la
        próxima iteración.
      </Alerta>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Boton texto="← Atrás" variante="soft" onPress={onAtras} style={{ flex: 1 }} />
        <Boton texto="Continuar — Conductor" onPress={() => onContinuar(d)} disabled={!listo} style={{ flex: 1.4 }} />
      </View>
    </View>
  )
}

const est = StyleSheet.create({
  titulo: { fontSize: 15, fontWeight: '800', color: color.text },
  label: { fontSize: 12, fontWeight: '700', color: color.text2, marginBottom: 6 },
  fecha: {
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 13,
    backgroundColor: color.white,
  },
})
