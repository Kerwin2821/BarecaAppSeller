import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePathname, useRouter } from 'expo-router'
import { useAuth } from '../lib/auth'
import { etiquetaRol } from '../lib/roles'
import { iniciales } from '../lib/formato'
import { menuPorRol, type ItemMenu } from './menu'
import { Avatar } from './Ui'
import { IcoSalir } from './Iconos'
import { color, radio } from '../lib/tema'

interface DrawerCtx {
  abrir: () => void
  cerrar: () => void
}
const Ctx = createContext<DrawerCtx | null>(null)

const ANCHO = 300

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [montado, setMontado] = useState(false)
  const x = useRef(new Animated.Value(-ANCHO)).current
  const fade = useRef(new Animated.Value(0)).current
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const pathname = usePathname()
  const { user, cerrarSesion } = useAuth()

  const abrir = useCallback(() => {
    setMontado(true)
    Animated.parallel([
      Animated.timing(x, { toValue: 0, duration: 240, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start()
  }, [x, fade])

  const cerrar = useCallback(() => {
    Animated.parallel([
      Animated.timing(x, { toValue: -ANCHO, duration: 200, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setMontado(false))
  }, [x, fade])

  const grupos = ['Operación', 'Gestión', 'Cuenta'] as const
  const items = menuPorRol(user?.role)
  const rutaBase = '/' + (pathname.replace(/^\//, '').split('/')[0] ?? '')

  const ir = (item: ItemMenu) => {
    cerrar()
    if (rutaBase !== item.ruta) router.push(item.ruta as never)
  }

  const salir = async () => {
    cerrar()
    await cerrarSesion()
    router.replace('/login')
  }

  return (
    <Ctx.Provider value={{ abrir, cerrar }}>
      {children}
      {montado && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View style={[StyleSheet.absoluteFill, est.velo, { opacity: fade }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={cerrar} />
          </Animated.View>
          <Animated.View style={[est.panel, { paddingTop: insets.top + 12, transform: [{ translateX: x }] }]}>
            <View style={est.marca}>
              <Image source={require('../../assets/logo-bareca.png')} style={est.logo} />
            </View>

            <View style={est.usuario}>
              <Avatar texto={iniciales(`${user?.firstName} ${user?.lastName}`.trim() || user?.email)} size={40} invertido />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={est.usuarioNombre} numberOfLines={1}>
                  {`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Vendedor'}
                </Text>
                <Text style={est.usuarioRol}>{etiquetaRol(user?.role)}{user?.code ? ` · ${user.code}` : ''}</Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}>
              {grupos.map((g) => {
                const delGrupo = items.filter((i) => i.grupo === g)
                if (delGrupo.length === 0) return null
                return (
                  <View key={g} style={{ marginTop: 14 }}>
                    <Text style={est.grupo}>{g.toUpperCase()}</Text>
                    {delGrupo.map((item) => {
                      const activo = rutaBase === item.ruta
                      const c = activo ? color.primary : color.text2
                      return (
                        <Pressable
                          key={item.ruta}
                          onPress={() => ir(item)}
                          style={({ pressed }) => [est.item, activo && est.itemActivo, pressed && { opacity: 0.7 }]}
                        >
                          <item.Icono color={c} size={20} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[est.itemTitulo, { color: activo ? color.primaryDark : color.text }]} numberOfLines={1}>
                              {item.titulo}
                            </Text>
                            <Text style={est.itemSub} numberOfLines={1}>{item.subtitulo}</Text>
                          </View>
                        </Pressable>
                      )
                    })}
                  </View>
                )
              })}

              <Pressable onPress={salir} style={({ pressed }) => [est.salir, pressed && { opacity: 0.7 }]}>
                <IcoSalir color={color.danger} size={20} />
                <Text style={est.salirTexto}>Cerrar sesión</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      )}
    </Ctx.Provider>
  )
}

export function useDrawer(): DrawerCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDrawer debe usarse dentro de <DrawerProvider>')
  return c
}

const est = StyleSheet.create({
  velo: { backgroundColor: 'rgba(15,42,59,0.4)' },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: ANCHO,
    backgroundColor: color.white,
    borderRightWidth: 1,
    borderRightColor: color.borderSoft,
    paddingHorizontal: 12,
  },
  marca: { paddingHorizontal: 6, paddingBottom: 8 },
  logo: { width: 132, height: 44, resizeMode: 'contain' },
  usuario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: color.primaryTint,
    borderRadius: radio.md + 2,
    padding: 11,
    marginTop: 4,
  },
  usuarioNombre: { fontSize: 13.5, fontWeight: '800', color: color.text },
  usuarioRol: { fontSize: 11, color: color.text3, marginTop: 1 },
  grupo: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, color: color.text4, paddingHorizontal: 8, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 8, borderRadius: radio.md },
  itemActivo: { backgroundColor: color.primaryLight },
  itemTitulo: { fontSize: 13.5, fontWeight: '700' },
  itemSub: { fontSize: 10.5, color: color.text4, marginTop: 1 },
  salir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
  },
  salirTexto: { fontSize: 13.5, fontWeight: '700', color: color.danger },
})
