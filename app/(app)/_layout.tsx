import { View } from 'react-native'
import { Stack } from 'expo-router'
import { DrawerProvider } from '@/components/Drawer'
import { AppHeader } from '@/components/AppHeader'
import { color } from '@/lib/tema'

/**
 * Grupo autenticado: envuelve las pantallas en el drawer (menú por rol) y un
 * header con la campana de notificaciones. Cada pantalla fija su título con
 * `options={{ title }}`.
 */
export default function AppLayout() {
  return (
    <DrawerProvider>
      <View style={{ flex: 1, backgroundColor: color.bgApp }}>
        <Stack
          screenOptions={{
            header: ({ options }) => <AppHeader titulo={options.title ?? 'Bareca'} />,
            contentStyle: { backgroundColor: color.bgApp },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Inicio' }} />
          <Stack.Screen name="polizas/index" options={{ title: 'Mis Ventas' }} />
          <Stack.Screen name="polizas/[id]" options={{ title: 'Detalle de Póliza' }} />
          <Stack.Screen name="comisiones" options={{ title: 'Mis Comisiones' }} />
          <Stack.Screen name="reporte" options={{ title: 'Reporte de Pólizas' }} />
          <Stack.Screen name="rachas" options={{ title: 'Mis Rachas' }} />
          <Stack.Screen name="equipo" options={{ title: 'Gestión de Equipo' }} />
          <Stack.Screen name="perfil" options={{ title: 'Mi Perfil' }} />
          <Stack.Screen name="nueva-venta" options={{ title: 'Nueva Venta' }} />
          <Stack.Screen name="mapa-conexiones" options={{ title: 'Mapa de Conexiones' }} />
          <Stack.Screen name="soporte" options={{ title: 'Soporte' }} />
          <Stack.Screen name="chat" options={{ title: 'Chat' }} />
          <Stack.Screen name="ajuste-pagos" options={{ title: 'Ajuste de Pagos' }} />
          <Stack.Screen name="solicitudes-modificacion" options={{ title: 'Solicitudes de Modificación' }} />
        </Stack>
      </View>
    </DrawerProvider>
  )
}
