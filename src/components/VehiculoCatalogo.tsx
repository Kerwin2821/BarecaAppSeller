import { useCallback, useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { catalogoApi } from '../lib/endpoints'
import { Dropdown, type OpcionDrop } from './Dropdown'
import { Campo } from './Ui'
import { color } from '../lib/tema'

/**
 * Selector de vehículo del catálogo normalizado — réplica del
 * `vehiculo-catalogo-picker` del portal: **Año → Marca → Modelo → Versión**,
 * con opción **"Otro"** (texto libre) en cada combo y **prefill del OCR**
 * (matchea marca/modelo por nombre y deja la versión al vendedor). Al completar
 * emite `onSeleccion` con `catVersionAnioId` (o null si va por texto libre).
 */

export interface SeleccionVehiculo {
  catVersionAnioId: number | null
  marca: string
  modelo: string
  version: string
  anio: number | null
}
export interface PrefillVehiculo {
  marca?: string | null
  modelo?: string | null
  anio?: number | null
}
interface Opcion {
  id: string
  nombre: string
}
const MANUAL = '__manual__'
const ANIO_MIN = 1950 // RCV baja hasta vehículos viejos

const desenv = (r: any): any[] => (Array.isArray(r) ? r : (r?.data ?? r?.content ?? []))
const norm = (s?: string | null) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Mejor coincidencia: exacta → empieza-con → contiene (nombres normalizados). */
function match(list: Opcion[], texto?: string | null): Opcion | null {
  const t = norm(texto)
  if (!t || !list.length) return null
  let hit = list.find((o) => norm(o.nombre) === t)
  if (hit) return hit
  hit = list.find((o) => norm(o.nombre).startsWith(t) || t.startsWith(norm(o.nombre)))
  if (hit) return hit
  return list.find((o) => norm(o.nombre).includes(t) || t.includes(norm(o.nombre))) ?? null
}

export function VehiculoCatalogo({
  prefill,
  onSeleccion,
}: {
  prefill?: PrefillVehiculo | null
  onSeleccion: (s: SeleccionVehiculo) => void
}) {
  const [anioSel, setAnioSel] = useState<number | null>(null)
  const [marcas, setMarcas] = useState<Opcion[]>([])
  const [modelos, setModelos] = useState<Opcion[]>([])
  const [versiones, setVersiones] = useState<Opcion[]>([])
  const [marcaId, setMarcaId] = useState('')
  const [modeloId, setModeloId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [marcaManual, setMarcaManual] = useState(false)
  const [modeloManual, setModeloManual] = useState(false)
  const [versionManual, setVersionManual] = useState(false)
  const [marcaTexto, setMarcaTexto] = useState('')
  const [modeloTexto, setModeloTexto] = useState('')
  const [versionTexto, setVersionTexto] = useState('')
  const [sinDataAnio, setSinDataAnio] = useState(false)
  const [anioNoDisp, setAnioNoDisp] = useState(false)
  const [cargando, setCargando] = useState(false)
  const ocrRef = useRef({ marca: '', modelo: '' })

  const aniosDisponibles = (() => {
    const hasta = new Date().getFullYear() + 1
    const arr: number[] = []
    for (let y = hasta; y >= ANIO_MIN; y--) arr.push(y)
    return arr
  })()

  const anioParam = useCallback(() => (sinDataAnio ? undefined : (anioSel ?? undefined)), [sinDataAnio, anioSel])

  /** getMarcas(año); si vacío → catálogo completo (RCV permite texto libre). */
  const cargarMarcasParaAnio = useCallback(async (y: number): Promise<Opcion[]> => {
    const conAnio = desenv(await catalogoApi.marcas(y))
    if (conAnio.length === 0) {
      setSinDataAnio(true)
      return desenv(await catalogoApi.marcas())
    }
    setSinDataAnio(false)
    return conAnio
  }, [])

  const emitir = useCallback(
    (s: SeleccionVehiculo) => onSeleccion(s),
    [onSeleccion],
  )

  const emitirManual = useCallback(
    (over?: Partial<{ marca: string; modelo: string; version: string }>) => {
      const marca = over?.marca ?? (marcaManual ? marcaTexto : (marcas.find((m) => m.id === marcaId)?.nombre ?? ''))
      const modelo = over?.modelo ?? (modeloManual ? modeloTexto : (modelos.find((m) => m.id === modeloId)?.nombre ?? ''))
      const version = over?.version ?? (versionManual ? versionTexto : (versiones.find((v) => v.id === versionId)?.nombre ?? ''))
      emitir({ catVersionAnioId: null, marca, modelo, version, anio: anioSel })
    },
    [marcaManual, marcaTexto, marcas, marcaId, modeloManual, modeloTexto, modelos, modeloId, versionManual, versionTexto, versiones, versionId, anioSel, emitir],
  )

  const onAnio = useCallback(
    (v: string) => {
      const y = v ? Number(v) : null
      setAnioSel(y)
      setMarcaId(''); setModeloId(''); setVersionId('')
      setMarcas([]); setModelos([]); setVersiones([])
      setMarcaManual(false); setModeloManual(false); setVersionManual(false)
      setAnioNoDisp(false); setSinDataAnio(false)
      if (!y) return
      setCargando(true)
      cargarMarcasParaAnio(y)
        .then(setMarcas)
        .catch(() => undefined)
        .finally(() => setCargando(false))
    },
    [cargarMarcasParaAnio],
  )

  const entrarManualMarca = useCallback(() => {
    setMarcaManual(true); setMarcaId(''); setModelos([]); setVersiones([])
    setModeloManual(true); setVersionManual(true); setAnioNoDisp(false)
    setMarcaTexto((t) => t || ocrRef.current.marca)
    setModeloTexto((t) => t || ocrRef.current.modelo)
    emitirManual({ marca: marcaTexto || ocrRef.current.marca, modelo: modeloTexto || ocrRef.current.modelo, version: versionTexto })
  }, [emitirManual, marcaTexto, modeloTexto, versionTexto])

  const onMarca = useCallback(
    (id: string) => {
      if (id === MANUAL) return entrarManualMarca()
      setMarcaManual(false); setMarcaId(id)
      setModeloId(''); setVersionId(''); setModelos([]); setVersiones([])
      setModeloManual(false); setVersionManual(false); setAnioNoDisp(false)
      if (!id) return
      catalogoApi.modelos(id, anioParam()).then((r) => setModelos(desenv(r))).catch(() => undefined)
    },
    [entrarManualMarca, anioParam],
  )

  const entrarManualModelo = useCallback(() => {
    setModeloManual(true); setModeloId(''); setVersiones([]); setVersionManual(true); setAnioNoDisp(false)
    setModeloTexto((t) => t || ocrRef.current.modelo)
    emitirManual({ modelo: modeloTexto || ocrRef.current.modelo, version: versionTexto })
  }, [emitirManual, modeloTexto, versionTexto])

  const onModelo = useCallback(
    (id: string) => {
      if (id === MANUAL) return entrarManualModelo()
      setModeloManual(false); setModeloId(id)
      setVersionId(''); setVersiones([]); setVersionManual(false); setAnioNoDisp(false)
      if (!id) return
      catalogoApi.versiones(id, anioParam()).then((r) => setVersiones(desenv(r))).catch(() => undefined)
    },
    [entrarManualModelo, anioParam],
  )

  const onVersion = useCallback(
    (id: string) => {
      if (id === MANUAL) {
        setVersionManual(true)
        emitirManual({ version: versionTexto })
        return
      }
      setVersionManual(false); setVersionId(id); setAnioNoDisp(false)
      const y = anioSel
      if (!id || y == null) return
      const nombreMarca = marcas.find((m) => m.id === marcaId)?.nombre ?? ''
      const nombreModelo = modelos.find((m) => m.id === modeloId)?.nombre ?? ''
      const nombreVersion = versiones.find((v) => v.id === id)?.nombre ?? ''
      if (sinDataAnio) {
        emitir({ catVersionAnioId: null, marca: nombreMarca, modelo: nombreModelo, version: nombreVersion, anio: y })
        return
      }
      setCargando(true)
      catalogoApi
        .anios(id)
        .then((r) => {
          const lista = desenv(r) as { id: string | number; anio: number }[]
          const hoja = lista.find((a) => a.anio === y)
          if (!hoja) {
            setAnioNoDisp(true)
            return
          }
          emitir({ catVersionAnioId: Number(hoja.id), marca: nombreMarca, modelo: nombreModelo, version: nombreVersion, anio: y })
        })
        .catch(() => setAnioNoDisp(true))
        .finally(() => setCargando(false))
    },
    [anioSel, marcas, marcaId, modelos, modeloId, versiones, sinDataAnio, emitir, emitirManual, versionTexto],
  )

  // Prefill del OCR: matchea año→marca→modelo, deja la versión para el vendedor.
  const prefillKey = `${prefill?.marca ?? ''}|${prefill?.modelo ?? ''}|${prefill?.anio ?? ''}`
  useEffect(() => {
    if (!prefill || (!prefill.marca && prefill.anio == null)) return
    ocrRef.current = { marca: (prefill.marca ?? '').toString(), modelo: (prefill.modelo ?? '').toString() }
    let vivo = true
    ;(async () => {
      const y = prefill.anio != null ? Number(prefill.anio) : null
      setMarcaId(''); setModeloId(''); setVersionId('')
      setModelos([]); setVersiones([]); setAnioNoDisp(false); setSinDataAnio(false)
      setMarcaManual(false); setModeloManual(false); setVersionManual(false)
      setMarcaTexto(''); setModeloTexto(''); setVersionTexto('')
      if (!y || y < ANIO_MIN) {
        setAnioSel(null); setMarcas([])
        return
      }
      setAnioSel(y)
      setCargando(true)
      try {
        const ms = await cargarMarcasParaAnio(y)
        if (!vivo) return
        setMarcas(ms)
        const m = match(ms, prefill.marca)
        if (m) {
          setMarcaId(m.id)
          const mos = desenv(await catalogoApi.modelos(m.id, y))
          if (!vivo) return
          setModelos(mos)
          const mo = match(mos, prefill.modelo)
          if (mo) {
            setModeloId(mo.id)
            const vs = desenv(await catalogoApi.versiones(mo.id, y))
            if (!vivo) return
            setVersiones(vs) // marca+modelo del catálogo; el vendedor elige la versión
          }
          // Si el modelo no matchea, dejamos el desplegable de modelos cargado para que
          // el vendedor lo elija (y así se cargan las versiones) — igual que la web.
        }
        // Si la marca no matchea, se deja el desplegable de marcas cargado para elegir.
      } catch {
        /* red falla → el vendedor completa a mano */
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey])

  const opc = (xs: Opcion[]): OpcionDrop[] => [
    ...xs.map((x) => ({ valor: x.id, texto: x.nombre })),
    { valor: MANUAL, texto: 'Otro (no está en la lista)' },
  ]
  const opcAnios: OpcionDrop[] = aniosDisponibles.map((y) => ({ valor: String(y), texto: String(y) }))

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 11.5, color: color.text3 }}>
        Elige el año y luego marca, modelo y versión para identificar el vehículo del catálogo.
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Dropdown etiqueta="Año" placeholder="Año" opciones={opcAnios} valor={anioSel ? String(anioSel) : null} onCambiar={onAnio} />
        </View>
        <View style={{ flex: 1.4 }}>
          {marcaManual ? (
            <Campo
              etiqueta="Marca"
              placeholder="Escribe la marca"
              autoCapitalize="characters"
              value={marcaTexto}
              onChangeText={(t) => {
                setMarcaTexto(t)
                emitirManual({ marca: t })
              }}
            />
          ) : (
            <Dropdown
              etiqueta="Marca"
              placeholder="Marca"
              opciones={opc(marcas)}
              valor={marcaId || null}
              onCambiar={onMarca}
              cargando={cargando}
              deshabilitado={!anioSel}
            />
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          {modeloManual ? (
            <Campo
              etiqueta="Modelo"
              placeholder="Escribe el modelo"
              value={modeloTexto}
              onChangeText={(t) => {
                setModeloTexto(t)
                emitirManual({ modelo: t })
              }}
            />
          ) : (
            <Dropdown
              etiqueta="Modelo"
              placeholder="Modelo"
              opciones={opc(modelos)}
              valor={modeloId || null}
              onCambiar={onModelo}
              deshabilitado={!marcaId}
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          {versionManual ? (
            <Campo
              etiqueta="Versión"
              placeholder="Escribe la versión"
              value={versionTexto}
              onChangeText={(t) => {
                setVersionTexto(t)
                emitirManual({ version: t })
              }}
            />
          ) : (
            <Dropdown
              etiqueta="Versión"
              placeholder="Versión"
              opciones={opc(versiones)}
              valor={versionId || null}
              onCambiar={onVersion}
              deshabilitado={!modeloId}
            />
          )}
        </View>
      </View>
      {marcaManual || modeloManual || versionManual ? (
        <Text style={{ fontSize: 11.5, color: color.primaryDark, lineHeight: 16 }}>
          Estás escribiendo datos que no están en el catálogo; se guardarán tal cual con la póliza.
        </Text>
      ) : null}
      {anioNoDisp ? (
        <Text style={{ fontSize: 11.5, color: color.danger, lineHeight: 16 }}>
          Esta versión no está disponible para el año {anioSel}. Elige otra versión u otro año.
        </Text>
      ) : null}
    </View>
  )
}
