import { Tabs } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { PortalProvider } from '@/components/PortalContexto'
import { Encabezado } from '@/components/Encabezado'
import { IconoDashboard, IconoMapa, IconoPerfil, IconoUsuarios } from '@/components/Iconos'
import { color } from '@/lib/tema'

export default function TabsLayout() {
  const { admin } = useAuth()
  const esAdmin = admin?.rol === 'ADMIN'

  return (
    <PortalProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: color.navy,
          tabBarInactiveTintColor: color.text3,
          tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700' },
          tabBarStyle: { backgroundColor: color.white, borderTopColor: color.borderSoft },
          headerShown: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            header: () => (
              <Encabezado titulo="Dashboard" subtitulo="Vista general de la operación Winspec" />
            ),
            tabBarIcon: ({ color: c }) => <IconoDashboard color={c} />,
          }}
        />
        <Tabs.Screen
          name="mapa"
          options={{
            title: 'Mapa en Vivo',
            header: () => (
              <Encabezado titulo="Mapa de Inspecciones" subtitulo="Peritajes geolocalizados en tiempo real" />
            ),
            tabBarIcon: ({ color: c }) => <IconoMapa color={c} />,
          }}
        />
        <Tabs.Screen
          name="usuarios"
          options={{
            title: 'Usuarios',
            // Gestión de usuarios: exclusiva del rol ADMIN (espejo de SoloAdmin del portal).
            href: esAdmin ? undefined : null,
            header: () => (
              <Encabezado titulo="Gestión de Usuarios" subtitulo="Accesos y roles del portal" />
            ),
            tabBarIcon: ({ color: c }) => <IconoUsuarios color={c} />,
          }}
        />
        <Tabs.Screen
          name="perfil"
          options={{
            title: 'Mi Perfil',
            header: () => <Encabezado titulo="Mi Perfil" subtitulo="Datos personales y seguridad" />,
            tabBarIcon: ({ color: c }) => <IconoPerfil color={c} />,
          }}
        />
      </Tabs>
    </PortalProvider>
  )
}
