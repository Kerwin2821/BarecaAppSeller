import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as Location from 'expo-location'
import { geoApi, validacionApi, type GeoOpcion } from '../lib/endpoints'
import { VehiculoCatalogo, type PrefillVehiculo, type SeleccionVehiculo } from './VehiculoCatalogo'
import { mensajeDeError } from '../lib/api'
import { ocrCarnet, ocrCedula, type FuenteImagen, type ImagenElegida } from '../lib/ocr'
import { CamaraDoc } from './CamaraDoc'
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

/** Normaliza nombres de lugares para comparar (sin tildes/prefijos/signos). */
const normLugar = (s?: string | null) =>
  (s || '')
    .toString()
    .replace(/\b(municipio|parroquia|ciudad de|estado)\b/gi, ' ')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '')

/** Mejor coincidencia geo por nombre (exacta → contiene, sin falsos cortos). */
function matchGeo(list: GeoOpcion[], texto?: string | null): GeoOpcion | null {
  const t = normLugar(texto)
  if (!t || !list.length) return null
  const exact = list.find((o) => normLugar(o.nombre) === t)
  if (exact) return exact
  return (
    list.find((o) => {
      const n = normLugar(o.nombre)
      if (n.length < 4 || t.length < 4) return false
      return n.includes(t) || t.includes(n)
    }) ?? null
  )
}

/** Primera coincidencia probando varios nombres candidatos (municipio/ciudad). */
function primerMatch(list: GeoOpcion[], candidatos: (string | null | undefined)[]): GeoOpcion | null {
  for (const c of candidatos) {
    const m = matchGeo(list, c)
    if (m) return m
  }
  return null
}

/**
 * Reverse geocoding robusto para Venezuela: Nominatim (OpenStreetMap) primero —
 * da bien la jerarquía estado/municipio/ciudad — y expo-location como respaldo.
 * Devuelve el estado + candidatos de municipio y ciudad para emparejar al catálogo.
 */
async function reverseGeo(
  lat: number,
  lon: number,
): Promise<{ estado: string; municipioCands: string[]; ciudadCands: string[] }> {
  const limpiar = (arr: (string | null | undefined)[]) =>
    arr.filter((x): x is string => !!x && x.trim().length > 0)
  // 1) Nominatim (OpenStreetMap)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=es`
    const ctrl = new AbortController()
    const corte = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(url, {
      headers: { 'User-Agent': 'BarecaVendedores/1.0 (app)', 'Accept-Language': 'es' },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(corte))
    if (r.ok) {
      const j: any = await r.json()
      const a = j?.address ?? {}
      const estado = a.state ?? a.region ?? ''
      if (estado) {
        return {
          estado,
          municipioCands: limpiar([a.municipality, a.county, a.city_district, a.town, a.city]),
          ciudadCands: limpiar([a.city, a.town, a.village, a.suburb, a.neighbourhood, a.city_district, a.municipality]),
        }
      }
    }
  } catch {
    /* sin red o bloqueado → respaldo local */
  }
  // 2) expo-location (respaldo)
  try {
    const g = (await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon }))?.[0]
    if (g) {
      return {
        estado: g.region ?? '',
        municipioCands: limpiar([g.subregion, g.district, g.city]),
        ciudadCands: limpiar([g.city, g.district, g.name, g.subregion]),
      }
    }
  } catch {
    /* nada */
  }
  return { estado: '', municipioCands: [], ciudadCands: [] }
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
  scrollRef,
}: {
  onAtras: () => void
  onContinuar: (datos: DatosCliente) => void
  /** El vehículo solo aplica a RCV/Casco; el funerario lo oculta. */
  mostrarVehiculo?: boolean
  /** En Venta Express la cédula usa el OCR de `/ai/extract-cedula`. */
  express?: boolean
  /** ScrollView del wizard: para saltar a un campo faltante al tocar su chip. */
  scrollRef?: { current: { scrollTo: (o: { y: number; animated?: boolean }) => void } | null } | null
}) {
  const { avisar } = useToast()
  const [d, setD] = useState<DatosCliente>({
    tipoDoc: 'V',
    cedula: '',
    nombres: '',
    apellidos: '',
    genero: 'M', // Masculino por defecto
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
  // Contacto adelantado: al iniciar un OCR aparecen correo/teléfono debajo (y se
  // quedan) para que el vendedor los escriba mientras el documento se procesa.
  const [contactoTemprano, setContactoTemprano] = useState(false)
  const [camara, setCamara] = useState<null | 'cedula' | 'carnet'>(null)
  const [motorIgual, setMotorIgual] = useState(false)

  // Al tocar un chip de "falta completar", salta a esa tarjeta (Y medido con onLayout).
  const posY = useRef<Record<string, number>>({})
  const baseY = useRef(0)
  const irAFaltante = (f: string) => {
    const key =
      f.startsWith('Correo') || f.startsWith('Teléfono')
        ? 'contacto'
        : f === 'Estado'
          ? 'direccion'
          : f.startsWith('Placa') || f.startsWith('Serial') || f.startsWith('Versión')
            ? 'vehiculo'
            : 'tomador'
    const y = posY.current[key]
    if (y != null) scrollRef?.current?.scrollTo({ y: Math.max(0, baseY.current + y - 10), animated: true })
  }

  // "Igual a Carrocería": el serial del motor copia el de la carrocería (NIV).
  const alternarMotorIgual = (v: boolean) => {
    setMotorIgual(v)
    if (v) setD((x) => ({ ...x, serialMotor: x.serialNiv }))
  }

  const capturarCedula = useCallback(async (fuente: FuenteImagen, imagenPre?: ImagenElegida | null) => {
    setOcrCedulaCargando(true)
    setContactoTemprano(true)
    try {
      const r = await ocrCedula(fuente, express, imagenPre)
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

  const capturarCarnet = useCallback(async (fuente: FuenteImagen, imagenPre?: ImagenElegida | null) => {
    setOcrCarnetCargando(true)
    setContactoTemprano(true)
    try {
      const r = await ocrCarnet(fuente, imagenPre)
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
  const [geoError, setGeoError] = useState<string | null>(null)
  const ubicadoRef = useRef(false)
  const ubicarPorGps = useCallback(async (): Promise<boolean> => {
    setUbicando(true)
    setGeoError(null)
    try {
      // Si ya está concedido, NO vuelve a pedir permiso; si no, lo pide una vez.
      let perm = await Location.getForegroundPermissionsAsync()
      if (perm.status !== 'granted' && perm.canAskAgain) {
        perm = await Location.requestForegroundPermissionsAsync()
      }
      if (perm.status !== 'granted') {
        setGeoError('Sin permiso de ubicación. Selecciona el estado a mano o actívalo en Ajustes.')
        return false
      }
      // Posición: primero la ÚLTIMA CONOCIDA (instantánea) y, si no hay, la actual
      // con límite de tiempo. `getCurrentPositionAsync` puede no resolver nunca con
      // el GPS frío o bajo techo, y dejaba el autocompletado colgado en silencio.
      let pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }).catch(() => null)
      if (!pos) {
        pos = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 12000)),
        ])
      }
      if (!pos) {
        setGeoError('No pudimos obtener tu ubicación (GPS sin señal). Selecciona el estado a mano.')
        return false
      }
      const { estado: nEstado, municipioCands, ciudadCands } = await reverseGeo(pos.coords.latitude, pos.coords.longitude)
      const est = matchGeo(estados, nEstado)
      if (!est) {
        setGeoError(
          nEstado
            ? `Detectamos "${nEstado}" pero no coincide con el listado. Selecciona el estado a mano.`
            : 'No pudimos detectar tu estado. Selecciónalo a mano.',
        )
        return false
      }
      set('estadoId', est.id)
      set('municipioId', null)
      set('ciudadId', null)
      const [muns, ciuds] = await Promise.all([
        geoApi.municipios(est.id).then(aGeo).catch(() => [] as GeoOpcion[]),
        geoApi.ciudades(est.id).then(aGeo).catch(() => [] as GeoOpcion[]),
      ])
      setMunicipios(muns)
      setCiudades(ciuds)
      // Prueba municipio con los candidatos de municipio y, si falla, con los de ciudad (y viceversa).
      const mun = primerMatch(muns, [...municipioCands, ...ciudadCands])
      const ciu = primerMatch(ciuds, [...ciudadCands, ...municipioCands])
      if (mun) set('municipioId', mun.id)
      if (ciu) set('ciudadId', ciu.id)
      return true
    } catch {
      setGeoError('No pudimos detectar tu ubicación. Selecciona el estado a mano.')
      return false
    } finally {
      setUbicando(false)
    }
  }, [estados])

  // Al cargar los estados, intenta ubicar automáticamente (una sola vez y solo si
  // el vendedor no eligió aún un estado).
  useEffect(() => {
    if (ubicadoRef.current || estados.length === 0 || d.estadoId) return
    ubicadoRef.current = true
    // Si el intento automático falla (GPS frío, sin señal), se libera la marca para
    // poder reintentar —el vendedor también tiene el botón «Usar mi ubicación»—.
    void ubicarPorGps().then((ok) => {
      if (!ok) ubicadoRef.current = false
    })
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
    (!mostrarVehiculo ||
      (placaChk !== 'existe' &&
        placaChk !== 'checking' &&
        d.placa.trim().length > 0 &&
        d.serialNiv.trim().length > 0 &&
        d.serialMotor.trim().length > 0 &&
        d.version.trim().length > 0))

  // Qué falta para habilitar "Continuar" (para avisarle al vendedor).
  const verificandoCampos =
    correoChk === 'checking' || telefonoChk === 'checking' || (mostrarVehiculo && placaChk === 'checking')
  const faltantes: string[] = []
  if (d.cedula.trim().length < 5) faltantes.push('Cédula')
  if (d.nombres.trim().length < 2) faltantes.push('Nombres')
  if (d.apellidos.trim().length < 2) faltantes.push('Apellidos')
  if (!d.genero) faltantes.push('Género')
  if (!(d.correo.includes('@') || d.telefono.length >= 7)) faltantes.push('Correo o teléfono')
  if (!d.estadoId) faltantes.push('Estado')
  if (correoChk === 'existe') faltantes.push('Correo ya registrado')
  if (telefonoChk === 'existe') faltantes.push('Teléfono ya registrado')
  if (mostrarVehiculo && d.placa.trim().length === 0) faltantes.push('Placa')
  if (mostrarVehiculo && d.serialNiv.trim().length === 0) faltantes.push('Serial de carrocería')
  if (mostrarVehiculo && d.serialMotor.trim().length === 0) faltantes.push('Serial del motor')
  if (mostrarVehiculo && d.version.trim().length === 0) faltantes.push('Versión del vehículo')
  if (mostrarVehiculo && placaChk === 'existe') faltantes.push('Placa con póliza vigente')

  const fechaNac = d.fechaNacimiento ? new Date(`${d.fechaNacimiento}T12:00:00`) : new Date(2000, 0, 1)

  return (
    <View style={{ gap: 12 }} onLayout={(e) => { baseY.current = e.nativeEvent.layout.y }}>
      {/* ── Captura con OCR ──────────────────────────────────── */}
      <Tarjeta style={{ padding: 18, gap: 12 }}>
        <Text style={est.titulo}>Captura con OCR</Text>
        <Text style={est.hint}>Toma o sube una foto y autocompletamos los datos.</Text>
        <ZonaOCR
          etiqueta="Documento de identidad"
          detalle="Cédula / RIF del tomador"
          cargando={ocrCedulaCargando}
          onCapturar={capturarCedula}
          onCamara={() => setCamara('cedula')}
        />
        {mostrarVehiculo ? (
          <ZonaOCR
            etiqueta="Carnet de circulación"
            detalle="Extrae placa, seriales y color"
            cargando={ocrCarnetCargando}
            onCapturar={capturarCarnet}
            onCamara={() => setCamara('carnet')}
          />
        ) : null}
        {ocrCedulaCargando || ocrCarnetCargando || contactoTemprano ? (
          // Contacto adelantado: se escribe AQUÍ mientras el OCR procesa (mismo estado
          // que "Datos de Contacto", así lo escrito baja al formulario automáticamente).
          <View style={{ borderTopWidth: 1, borderTopColor: color.borderSoft, paddingTop: 12, gap: 10 }}>
            <Text style={est.hint}>
              ⚡ Mientras se procesa el documento, adelanta el contacto del cliente:
            </Text>
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
          </View>
        ) : null}
      </Tarjeta>

      <CamaraDoc
        visible={!!camara}
        tipo={camara ?? 'cedula'}
        onCerrar={() => setCamara(null)}
        onCapturar={(foto) => {
          const t = camara
          setCamara(null)
          if (t === 'cedula') void capturarCedula('camara', foto)
          else if (t === 'carnet') void capturarCarnet('camara', foto)
        }}
      />

      <Tarjeta style={{ padding: 18, gap: 14 }} onLayout={(e) => { posY.current.tomador = e.nativeEvent.layout.y }}>
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

      <Tarjeta style={{ padding: 18, gap: 14 }} onLayout={(e) => { posY.current.contacto = e.nativeEvent.layout.y }}>
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
      <Tarjeta style={{ padding: 18, gap: 14 }} onLayout={(e) => { posY.current.vehiculo = e.nativeEvent.layout.y }}>
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

      <Tarjeta style={{ padding: 18, gap: 14 }} onLayout={(e) => { posY.current.direccion = e.nativeEvent.layout.y }}>
        <Text style={est.titulo}>Dirección del Asegurado</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={[est.hint, { flex: 1 }]}>
            {ubicando ? '📍 Detectando tu ubicación…' : 'Estado, municipio y ciudad se completan por GPS; puedes corregirlos.'}
          </Text>
          {/* Reintento manual: si el GPS falló (sin señal, permiso denegado), el
              vendedor puede volver a intentarlo sin salir de la pantalla. */}
          {!ubicando && !d.estadoId ? (
            <Pressable onPress={() => void ubicarPorGps()} hitSlop={6} style={est.gpsBtn}>
              <Text style={est.gpsBtnTxt}>📍 Usar mi ubicación</Text>
            </Pressable>
          ) : null}
        </View>
        {geoError && !d.estadoId ? <Alerta tipo="info">{geoError}</Alerta> : null}
        <Dropdown etiqueta="Estado" placeholder="Selecciona un estado" opciones={aOpc(estados)} valor={d.estadoId ? String(d.estadoId) : null} onCambiar={elegirEstado} cargando={cargando.estados} />
        <Dropdown etiqueta="Municipio" placeholder="Selecciona un municipio" opciones={aOpc(municipios)} valor={d.municipioId ? String(d.municipioId) : null} onCambiar={(v) => set('municipioId', Number(v))} cargando={cargando.mun} deshabilitado={!d.estadoId} />
        <Dropdown etiqueta="Ciudad" placeholder="Selecciona una ciudad" opciones={aOpc(ciudades)} valor={d.ciudadId ? String(d.ciudadId) : null} onCambiar={(v) => set('ciudadId', Number(v))} cargando={cargando.ciu} deshabilitado={!d.estadoId} />
      </Tarjeta>

      {/* Aviso de qué falta para habilitar Continuar */}
      {!listo ? (
        <View style={est.faltanBox}>
          {verificandoCampos && faltantes.length === 0 ? (
            <Text style={est.faltanTitulo}>Verificando datos…</Text>
          ) : (
            <>
              <Text style={est.faltanTitulo}>Para continuar, completa:</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {faltantes.map((f) => (
                  <Pressable key={f} onPress={() => irAFaltante(f)} style={est.faltanChip} hitSlop={4}>
                    <Text style={est.faltanChipTexto}>{f}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}

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
  onCamara,
}: {
  etiqueta: string
  detalle: string
  cargando: boolean
  onCapturar: (fuente: FuenteImagen) => void
  onCamara?: () => void
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
          <Pressable onPress={() => (onCamara ? onCamara() : onCapturar('camara'))} style={est.zonaBtn}>
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
  gpsBtn: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: color.accent,
    backgroundColor: color.white,
  },
  gpsBtnTxt: { fontSize: 11.5, fontWeight: '800', color: color.accent },
  titulo: { fontSize: 15, fontWeight: '800', color: color.text },
  hint: { fontSize: 12, color: color.text3, lineHeight: 16 },
  label: { fontSize: 12, fontWeight: '700', color: color.text2, marginBottom: 6 },
  faltanBox: { backgroundColor: color.warningBg ?? '#FEF6E7', borderRadius: 12, padding: 12, marginTop: 6 },
  faltanTitulo: { fontSize: 12.5, fontWeight: '800', color: color.amber ?? '#B45309' },
  faltanChip: { backgroundColor: color.white, borderRadius: 99, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: color.warning ?? '#F59E0B' },
  faltanChipTexto: { fontSize: 11.5, fontWeight: '700', color: color.amber ?? '#B45309' },
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
