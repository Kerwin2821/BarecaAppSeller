import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../lib/auth'
import { puedeVender } from '../lib/roles'
import { IcoComisiones, IcoHome, IcoPerfil, IcoPolizas, IcoVenta } from './Iconos'
import { color } from '../lib/tema'

/** Rutas donde NO se muestra la barra (flujos a pantalla completa). */
const OCULTAR = ['/nueva-venta', '/chat']

/**
 * Barra de navegación inferior con "Vender" al centro y accesos principales a los
 * lados. Convive con el menú de hamburguesa (no lo reemplaza).
 */
export function BarraInferior() {
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const oculta = OCULTAR.some((h) => pathname.startsWith(h)) || /^\/polizas\/[^/]+$/.test(pathname)
  if (oculta) return null

  const puedeV = puedeVender(user?.role)
  const centro = puedeV ? { ruta: '/nueva-venta', label: 'Vender' } : { ruta: '/equipo', label: 'Equipo' }

  const lados: ({ ruta: string; label: string; Ico: typeof IcoHome } | null)[] = [
    { ruta: '/', label: 'Inicio', Ico: IcoHome },
    { ruta: '/polizas', label: 'Ventas', Ico: IcoPolizas },
    null,
    { ruta: '/comisiones', label: 'Comisiones', Ico: IcoComisiones },
    { ruta: '/perfil', label: 'Perfil', Ico: IcoPerfil },
  ]

  const activo = (ruta: string) => (ruta === '/' ? pathname === '/' : pathname === ruta || pathname.startsWith(`${ruta}/`))
  const ir = (ruta: string) => router.navigate(ruta as never)

  return (
    <View style={[est.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={est.barra}>
        {lados.map((it, i) =>
          it ? (
            <Pressable key={it.ruta} style={est.item} onPress={() => ir(it.ruta)} hitSlop={6}>
              <it.Ico color={activo(it.ruta) ? color.primary : color.text3} size={22} />
              <Text style={[est.label, activo(it.ruta) && { color: color.primary, fontWeight: '800' }]} numberOfLines={1}>
                {it.label}
              </Text>
            </Pressable>
          ) : (
            <View key={`sp-${i}`} style={est.item} />
          ),
        )}
      </View>

      <Pressable style={est.fab} onPress={() => ir(centro.ruta)}>
        <View style={est.fabCirc}>
          <IcoVenta color="#fff" size={25} />
        </View>
        <Text style={est.fabTxt}>{centro.label}</Text>
      </Pressable>
    </View>
  )
}

const est = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.white,
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
    shadowColor: '#0B2A3B',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  barra: { flexDirection: 'row', height: 56, alignItems: 'center' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 10, fontWeight: '600', color: color.text3 },
  fab: { position: 'absolute', left: '50%', marginLeft: -32, top: -20, width: 64, alignItems: 'center' },
  fabCirc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.accent,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabTxt: { fontSize: 10, fontWeight: '800', color: color.accent, marginTop: 3 },
})
