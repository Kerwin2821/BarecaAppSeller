import { useCallback, useMemo } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MapView, { Marker } from 'react-native-maps'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { reportApi } from '@/lib/endpoints'
import { desenvolver } from '@/lib/api'
import { actorUuid, etiquetaRol } from '@/lib/roles'
import { moneda, iniciales } from '@/lib/formato'
import type { UserRole } from '@/lib/tipos'
import { CabeceraPantalla } from '@/components/Pantalla'
import { EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Alerta, Avatar, Chip, Tarjeta } from '@/components/Ui'
import { color, fuenteMono, radio } from '@/lib/tema'

// ── Modelo normalizado de un nodo de la red ─────────────────
interface Nodo {
  key: string
  nombre: string
  rol?: string
  codigo?: string
  lat?: number
  lng?: number
  monto?: number
}

// Región inicial del mapa centrada en Venezuela.
const REGION_VE = { latitude: 8.0, longitude: -66.0, latitudeDelta: 8, longitudeDelta: 8 }
// El mapa (Google Maps) EXIGE una API key en el build nativo; sin ella, MapView crashea
// ("API key not found"). Por eso se muestra solo si se habilita explícitamente
// (EXPO_PUBLIC_MAPS_ENABLED=true); si no, un fallback y la red se ve en la lista.
const MAPS_ENABLED = process.env.EXPO_PUBLIC_MAPS_ENABLED === 'true'

// Claves candidatas por campo (la forma del subárbol es incierta → muy defensivo).
const NOMBRE_KEYS = ['nombre', 'nombreCompleto', 'nombreActor', 'nombreEntidad', 'razonSocial', 'descripcion']
const LAT_KEYS = ['lat', 'latitud', 'latitude']
const LNG_KEYS = ['lng', 'lon', 'long', 'longitud', 'longitude']
const MONTO_KEYS = ['montoTotal', 'total', 'monto', 'montoComision', 'totalComision', 'comision', 'montoGenerado']
const ROL_KEYS = ['tipoActor', 'nivel', 'role', 'rol', 'tipo']
const COD_KEYS = ['codigo', 'code', 'cod']
const ID_KEYS = [
  'id', 'uuid', 'actorUuid', 'barecaId', 'oficinaRegionalId', 'distribuidorId', 'kioscosPuestosId', 'empleadoId',
]
// Al descender, seguimos SIEMPRE los arreglos; para objetos, sólo estas llaves
// (evita seguir referencias hacia arriba como `padre` o al `proveedor`).
const OBJ_DESCENDER = new Set([
  'data', 'raiz', 'root', 'arbol', 'tree', 'result', 'resultado', 'subarbol', 'subArbol', 'red',
  'children', 'hijos', 'hijo', 'nodo', 'nodos', 'nodes', 'descendientes', 'descendencia', 'items',
])
const ROLES_CONOCIDOS: UserRole[] = ['BARECA', 'OFICINA_REGIONAL', 'DISTRIBUIDOR', 'KIOSCO', 'EMPLEADO']

function comoNumero(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'))
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function primerCampo(o: any, claves: string[]): any {
  for (const k of claves) {
    if (o != null && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]
  }
  return undefined
}

/** Coordenada plausible (descarta rangos inválidos y el "0,0" por defecto). */
function coordValida(lat?: number, lng?: number): boolean {
  return (
    lat !== undefined &&
    lng !== undefined &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  )
}

function esNodo(o: any): boolean {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false
  const tieneNombre = primerCampo(o, NOMBRE_KEYS) !== undefined || primerCampo(o, ['nombres']) !== undefined
  const tieneIdentidad = primerCampo(o, [...ROL_KEYS, ...COD_KEYS, ...MONTO_KEYS, ...ID_KEYS]) !== undefined
  const geo = coordValida(comoNumero(primerCampo(o, LAT_KEYS)), comoNumero(primerCampo(o, LNG_KEYS)))
  return (tieneNombre && tieneIdentidad) || geo
}

function construirNodo(o: any, i: number): Nodo {
  let nombre = String(primerCampo(o, NOMBRE_KEYS) ?? '').trim()
  if (!nombre) {
    nombre = `${primerCampo(o, ['nombres']) ?? ''} ${primerCampo(o, ['apellidos']) ?? ''}`.trim()
  }
  if (!nombre) nombre = '—'

  const lat = comoNumero(primerCampo(o, LAT_KEYS))
  const lng = comoNumero(primerCampo(o, LNG_KEYS))
  const valida = coordValida(lat, lng)
  const rolRaw = primerCampo(o, ROL_KEYS)
  const codigo = primerCampo(o, COD_KEYS)
  const id = primerCampo(o, ID_KEYS)

  return {
    key: `${id ?? codigo ?? 'n'}-${i}`,
    nombre,
    rol: rolRaw != null ? String(rolRaw) : undefined,
    codigo: codigo != null ? String(codigo) : undefined,
    lat: valida ? lat : undefined,
    lng: valida ? lng : undefined,
    monto: comoNumero(primerCampo(o, MONTO_KEYS)),
  }
}

/**
 * Aplana el subárbol a una lista de nodos, sea cual sea su forma: array plano,
 * objeto único, o jerarquía anidada (children/hijos/…). Emite sólo lo que parece
 * un nodo real (`esNodo`), así que recorrer arreglos ajenos no introduce ruido.
 */
function aplanar(raw: any): Nodo[] {
  const out: Nodo[] = []
  const vistos = new Set<any>()
  let seq = 0

  const visitar = (o: any): void => {
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o)) {
      for (const it of o) visitar(it)
      return
    }
    if (vistos.has(o)) return
    vistos.add(o)

    if (esNodo(o)) out.push(construirNodo(o, seq++))

    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v)) {
        for (const it of v) if (it && typeof it === 'object') visitar(it)
      } else if (v && typeof v === 'object' && OBJ_DESCENDER.has(k)) {
        visitar(v)
      }
    }
  }

  visitar(raw)
  return out
}

function etiquetaNivel(rol: string | undefined): string {
  if (!rol) return ''
  const up = rol.toUpperCase()
  return (ROLES_CONOCIDOS as string[]).includes(up) ? etiquetaRol(up as UserRole) : rol
}

function descripcionNodo(n: Nodo): string | undefined {
  const partes = [etiquetaNivel(n.rol), n.monto != null ? moneda(n.monto) : ''].filter(Boolean)
  return partes.length ? partes.join('  ·  ') : undefined
}

export default function MapaConexiones() {
  const { user } = useAuth()
  const insets = useSafeAreaInsets()

  const cargar = useCallback(async () => {
    if (!user) return null
    const id = actorUuid(user)
    if (!id) return null
    // La web usa /reporte/mapa (no el subárbol de comisiones).
    return reportApi.mapa(user.role, id)
  }, [user])
  const { datos, cargando, error, recargar } = useApi<any>(cargar, [user?.loginId])

  const nodos = useMemo(() => (datos != null ? aplanar(desenvolver(datos)) : []), [datos])
  const ubicados = useMemo(() => nodos.filter((n) => n.lat !== undefined && n.lng !== undefined), [nodos])

  return (
    <View style={est.pantalla}>
      <View style={est.cabeceraWrap}>
        <CabeceraPantalla titulo="Mapa de Conexiones" detalle="Tu red comercial" />
      </View>

      {!user ? (
        <View style={est.centro}>
          <EstadoVacio titulo="Sesión no disponible" detalle="Inicia sesión para ver tu red comercial." />
        </View>
      ) : error ? (
        <View style={est.centro}>
          <EstadoError mensaje={error} onReintentar={recargar} />
        </View>
      ) : (
        <>
          <View style={est.mapaWrap}>
            {MAPS_ENABLED ? (
            <MapView style={est.mapa} initialRegion={REGION_VE}>
              {ubicados.map((n) => (
                <Marker
                  key={n.key}
                  coordinate={{ latitude: n.lat as number, longitude: n.lng as number }}
                  title={n.nombre}
                  description={descripcionNodo(n)}
                />
              ))}
            </MapView>
            ) : (
              <View style={[est.mapa, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF1F7', padding: 24 }]}>
                <Text style={{ fontSize: 34 }}>🗺️</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: color.text, marginTop: 8, textAlign: 'center' }}>
                  Mapa no disponible en esta versión
                </Text>
                <Text style={{ fontSize: 12, color: color.text3, marginTop: 4, textAlign: 'center', lineHeight: 17 }}>
                  Tu red comercial se muestra abajo en la lista.
                </Text>
              </View>
            )}
            {ubicados.length > 0 ? (
              <View style={est.badge}>
                <Text style={est.badgeTexto}>{ubicados.length} ubicado{ubicados.length === 1 ? '' : 's'}</Text>
              </View>
            ) : null}
          </View>

          {cargando ? (
            <View style={est.listaCarga}>
              {[0, 1, 2, 3].map((i) => (
                <Tarjeta key={i} style={est.fila}>
                  <Skeleton w="55%" h={14} />
                  <Skeleton w="72%" h={11} style={{ marginTop: 10 }} />
                </Tarjeta>
              ))}
            </View>
          ) : nodos.length === 0 ? (
            <View style={est.centro}>
              <Tarjeta>
                <EstadoVacio
                  titulo="Sin conexiones"
                  detalle="Aún no hay nodos en tu red comercial, o el subárbol no devolvió datos."
                />
              </Tarjeta>
            </View>
          ) : (
            <FlatList
              data={nodos}
              keyExtractor={(n) => n.key}
              renderItem={({ item }) => <FilaNodo n={item} />}
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 28, gap: 12 }}
              refreshControl={
                <RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={color.primary} />
              }
              ListHeaderComponent={
                <Text style={est.listaTitulo}>
                  Red comercial ({nodos.length}
                  {ubicados.length ? ` · ${ubicados.length} en el mapa` : ''})
                </Text>
              }
              ListFooterComponent={
                <View style={{ marginTop: 14 }}>
                  <Alerta tipo="info">
                    Nodos y montos provienen del subárbol de transacciones
                    (/api/comision-transaccions/v1/transacciones/subarbol). Sólo los nodos con coordenadas
                    aparecen sobre el mapa.
                  </Alerta>
                </View>
              }
            />
          )}
        </>
      )}
    </View>
  )
}

function FilaNodo({ n }: { n: Nodo }) {
  const nivel = etiquetaNivel(n.rol)
  const ubicado = n.lat !== undefined && n.lng !== undefined
  return (
    <Tarjeta style={est.fila}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Avatar texto={iniciales(n.nombre)} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={est.nombre} numberOfLines={1}>
            {n.nombre}
          </Text>
          <View style={est.metaFila}>
            {nivel ? <Chip texto={nivel} fondo={color.primaryLight} colorTexto={color.primaryDark} /> : null}
            {n.codigo ? <Text style={est.meta}>cód. {n.codigo}</Text> : null}
            {ubicado ? <Text style={est.metaUbicado}>· ubicado</Text> : null}
          </View>
        </View>
        {n.monto != null ? <Text style={est.monto}>{moneda(n.monto)}</Text> : null}
      </View>
    </Tarjeta>
  )
}

const est = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.bgApp },
  cabeceraWrap: { paddingHorizontal: 16, paddingTop: 16 },
  mapaWrap: {
    height: 260,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: radio.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.bgCard,
  },
  mapa: { ...StyleSheet.absoluteFillObject },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(20,125,177,0.92)',
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radio.full,
  },
  badgeTexto: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  centro: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 24 },
  listaCarga: { paddingHorizontal: 16, paddingTop: 6, gap: 12 },
  listaTitulo: { fontSize: 13, fontWeight: '800', color: color.text, marginBottom: 10 },
  fila: { padding: 14 },
  nombre: { fontSize: 14, fontWeight: '800', color: color.text },
  metaFila: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' },
  meta: { fontSize: 11.5, color: color.text3 },
  metaUbicado: { fontSize: 11.5, color: color.success, fontWeight: '700' },
  monto: { fontSize: 13, fontWeight: '800', color: color.primary, fontFamily: fuenteMono },
})
