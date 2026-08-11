import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as Location from 'expo-location'
import { geoApi, validacionApi, type GeoOpcion } from '../lib/endpoints'
import { VehiculoCatalogo, type PrefillVehiculo, type SeleccionVehiculo } from './VehiculoCatalogo'
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

type Chk = 'idle' | 'checking' | 'libre' | 'existe'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Móviles/fijos venezolanos (igual que venezuelanPhone del portal).
const VE_PHONE_RE = /^(0412|0422|0414|0424|0416|0426|02\d{2})\d{7}$/

/** Teléfono VE a formato internacional (réplica de FormatService.toInternationalFormat). */
function aInternacional(phone: string): string {
  let c = (phone || '').replace(/\D/g, '')
  if (c.startsWith('58')) return `+${c}`
  if (c.startsWith('0')) c = c.slice(1)
  return `58${c}`
}

/** Normaliza la respuesta geo del BFF (array plano o {content}/{data}). */
function aGeo(r: any): GeoOpcion[] {
  const arr = Array.isArray(r) ? r : (r?.content ?? r?.data ?? [])
  return (arr as any[]).filter((x) => x && x.id != null && x.nombre)
}

/** Normaliza nombres de lugares para comparar (sin tildes/signos, mayúsculas). */
const normLugar = (s?: string | null) =>
  (s || '').toString().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '')

/** Mejor coincidencia geo por nombre (exacta → contiene). */
function matchGeo(list: GeoOpcion[], texto?: string | null): GeoOpcion | null {
  const t = normLugar(texto)
  if (!t || !list.length) return null
  const exact = list.find((o) => normLugar(o.nombre) === t)
  if (exact) return exact
  return list.find((o) => normLugar(o.nombre).includes(t) || t.includes(normLugar(o.nombre))) ?? null
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
  express = false,
}: {
  onAtras: () => void
  onContinuar: (datos: DatosCliente) => void
  /** El vehículo solo aplica a RCV/Casco; el funerario lo oculta. */
  mostrarVehiculo?: boolean
  /** En Venta Express la cédula usa el OCR de `/ai/extract-cedula`. */
  express?: boolean
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
      const r = await ocrCedula(fuente, express)
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
  }, [avisar, express])

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
          }
        })
        // Marca/modelo/año van al picker de catálogo (matchea y autoselecciona).
        if (r.marca || r.modelo || r.anio) {
          setOcrPrefill({ marca: r.marca ?? null, modelo: r.modelo ?? null, anio: r.anio ? Number(r.anio) : null })
        }
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

  // Validaciones en vivo (igual que la web): placa vigente + correo/teléfono ya registrados.
  const [placaChk, setPlacaChk] = useState<Chk>('idle')
  const [placaPoliza, setPlacaPoliza] = useState<string | null>(null)
  const [correoChk, setCorreoChk] = useState<Chk>('idle')
  const [telefonoChk, setTelefonoChk] = useState<Chk>('idle')

  // Placa → ¿póliza vigente? (debounce 500 ms, como activePolicyValidator).
  useEffect(() => {
    if (!mostrarVehiculo) return
    const placa = d.placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (placa.length < 5) {
      setPlacaChk('idle')
      setPlacaPoliza(null)
      return
    }
    setPlacaChk('checking')
    const t = setTimeout(async () => {
      try {
        const r = await validacionApi.polizaVigentePorPlaca(placa)
        const num = r?.numeroPoliza ?? r?.data?.numeroPoliza ?? (r?.data === 'EXISTENTE' ? 'EXISTENTE' : null)
        const existe = !!num && r?.statusCode !== 404
        setPlacaChk(existe ? 'existe' : 'libre')
        setPlacaPoliza(existe ? String(num) : null)
      } catch {
        // 404/errores → sin póliza (como catchError→of(null)); no bloquea.
        setPlacaChk('libre')
        setPlacaPoliza(null)
      }
    }, 500)
    return () => clearTimeout(t)
  }, [d.placa, mostrarVehiculo])

  // Correo → ¿ya existe? (debounce 500 ms, como emailUniqueness).
  useEffect(() => {
    const email = d.correo.trim()
    if (!EMAIL_RE.test(email)) {
      setCorreoChk('idle')
      return
    }
    setCorreoChk('checking')
    const t = setTimeout(async () => {
      try {
        const r = await validacionApi.existeCorreo(email)
        setCorreoChk(r?.data === true ? 'existe' : 'libre')
      } catch {
        setCorreoChk('libre')
      }
    }, 500)
    return () => clearTimeout(t)
  }, [d.correo])

  // Teléfono → ¿ya existe? (debounce 500 ms, como phoneUniqueness).
  useEffect(() => {
    const tel = d.telefono.trim()
    if (!VE_PHONE_RE.test(tel)) {
      setTelefonoChk('idle')
      return
    }
    setTelefonoChk('checking')
    const t = setTimeout(async () => {
      try {
        const r = await validacionApi.existeTelefono(aInternacional(tel))
        setTelefonoChk(r?.data === true ? 'existe' : 'libre')
      } catch {
        setTelefonoChk('libre')
      }
    }, 500)
    return () => clearTimeout(t)
  }, [d.telefono])

  // Prefill del catálogo de vehículo desde el OCR del carnet (marca/modelo/año).
  const [ocrPrefill, setOcrPrefill] = useState<PrefillVehiculo | null>(null)

  useEffect(() => {
    setCarga('estados', true)
    geoApi
      .estados()
      .then((r) => setEstados(aGeo(r)))
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCarga('estados', false))
  }, [])

  // El picker de catálogo devuelve marca/modelo/versión/año + catVersionAnioId.
  const aplicarSeleccionVehiculo = useCallback((s: SeleccionVehiculo) => {
    setD((x) => ({
      ...x,
      marca: s.marca,
      modelo: s.modelo,
      version: s.version,
      anio: s.anio,
      catVersionAnioId: s.catVersionAnioId,
    }))
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

  // Autoselección de estado/municipio/ciudad por GPS (reverse geocoding), en
  // silencio: se dispara sola al llegar a la pantalla. El único diálogo posible
  // es el permiso del sistema operativo (obligatorio), y solo la primera vez.
  const [ubicando, setUbicando] = useState(false)
  const ubicadoRef = useRef(false)
  const ubicarPorGps = useCallback(async () => {
    setUbicando(true)
    try {
      // Si ya está concedido, NO vuelve a pedir permiso; si no, lo pide una vez.
      let perm = await Location.getForegroundPermissionsAsync()
      if (perm.status !== 'granted' && perm.canAskAgain) {
        perm = await Location.requestForegroundPermissionsAsync()
      }
      if (perm.status !== 'granted') return // sin permiso → se elige a mano, sin molestar
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const geo = (await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }))?.[0]
      if (!geo) return
      const nEstado = geo.region ?? ''
      const nMunicipio = geo.subregion ?? geo.district ?? ''
      const nCiudad = geo.city ?? geo.district ?? ''
      const est = matchGeo(estados, nEstado)
      if (!est) return
      set('estadoId', est.id)
      set('municipioId', null)
      set('ciudadId', null)
      const [muns, ciuds] = await Promise.all([
        geoApi.municipios(est.id).then(aGeo).catch(() => [] as GeoOpcion[]),
        geoApi.ciudades(est.id).then(aGeo).catch(() => [] as GeoOpcion[]),
      ])
      setMunicipios(muns)
      setCiudades(ciuds)
      const mun = matchGeo(muns, nMunicipio) ?? matchGeo(muns, nCiudad)
      const ciu = matchGeo(ciuds, nCiudad) ?? matchGeo(ciuds, nMunicipio)
      if (mun) set('municipioId', mun.id)
      if (ciu) set('ciudadId', ciu.id)
    } catch {
      /* silencioso: la dirección se puede elegir a mano */
    } finally {
      setUbicando(false)
    }
  }, [estados])

  // Al cargar los estados, intenta ubicar automáticamente (una sola vez y solo si
  // el vendedor no eligió aún un estado).
  useEffect(() => {
    if (ubicadoRef.current || estados.length === 0 || d.estadoId) return
    ubicadoRef.current = true
    void ubicarPorGps()
  }, [estados, d.estadoId, ubicarPorGps])

  const listo =
    d.cedula.trim().length >= 5 &&
    d.nombres.trim().length >= 2 &&
    d.apellidos.trim().length >= 2 &&
    !!d.genero &&
    (d.correo.includes('@') || d.telefono.length >= 7) &&
    !!d.estadoId &&
    // No avanzar si hay coincidencia (o mientras se valida), como la web.
    correoChk !== 'existe' &&
    correoChk !== 'checking' &&
    telefonoChk !== 'existe' &&
    telefonoChk !== 'checking' &&
    (!mostrarVehiculo || (placaChk !== 'existe' && placaChk !== 'checking'))

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
        <View>
          <Campo
            etiqueta="Correo electrónico"
            placeholder="cliente@correo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={d.correo}
            error={correoChk === 'existe'}
            onChangeText={(t) => set('correo', t.trim())}
          />
          <EstadoChk estado={correoChk} mensajeExiste="Este correo ya está registrado en el sistema." />
        </View>
        <View>
          <Campo
            etiqueta="Teléfono"
            placeholder="04141234567"
            keyboardType="phone-pad"
            value={d.telefono}
            error={telefonoChk === 'existe'}
            onChangeText={(t) => set('telefono', t.replace(/[^0-9]/g, ''))}
          />
          <EstadoChk estado={telefonoChk} mensajeExiste="Este teléfono ya está registrado en el sistema." />
        </View>
      </Tarjeta>

      {mostrarVehiculo ? (
      <Tarjeta style={{ padding: 18, gap: 14 }}>
        <Text style={est.titulo}>Datos del Vehículo</Text>
        <Text style={est.hint}>Selecciona el vehículo del catálogo; los seriales vienen del carnet.</Text>
        <VehiculoCatalogo prefill={ocrPrefill} onSeleccion={aplicarSeleccionVehiculo} />
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Campo
              etiqueta="Placa"
              placeholder="AB123CD"
              autoCapitalize="characters"
              value={d.placa}
              error={placaChk === 'existe'}
              onChangeText={(t) => set('placa', t.toUpperCase())}
            />
            <EstadoChk
              estado={placaChk}
              mensajeExiste={`Placa con póliza vigente${placaPoliza && placaPoliza !== 'EXISTENTE' ? ` (Nro: ${placaPoliza})` : ''}. No se puede continuar.`}
            />
          </View>
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
        <Text style={est.hint}>
          {ubicando ? '📍 Detectando tu ubicación…' : 'Estado, municipio y ciudad se completan por GPS; puedes corregirlos.'}
        </Text>
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

/** Línea de estado de una validación en vivo (verificando / disponible / existe). */
function EstadoChk({ estado, mensajeExiste }: { estado: Chk; mensajeExiste: string }) {
  if (estado === 'idle') return null
  if (estado === 'checking') return <Text style={est.chkVerificando}>Verificando…</Text>
  if (estado === 'existe') return <Text style={est.chkError}>⚠ {mensajeExiste}</Text>
  return <Text style={est.chkOk}>✓ Disponible</Text>
}

const est = StyleSheet.create({
  titulo: { fontSize: 15, fontWeight: '800', color: color.text },
  hint: { fontSize: 12, color: color.text3, lineHeight: 16 },
  label: { fontSize: 12, fontWeight: '700', color: color.text2, marginBottom: 6 },
  chkVerificando: { fontSize: 11.5, color: color.text3, marginTop: 5 },
  chkError: { fontSize: 11.5, color: color.danger, fontWeight: '700', marginTop: 5, lineHeight: 15 },
  chkOk: { fontSize: 11.5, color: color.success, fontWeight: '700', marginTop: 5 },
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
