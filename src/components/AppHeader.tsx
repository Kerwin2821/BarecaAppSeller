import { useCallback, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../lib/auth'
import { actorUuid } from '../lib/roles'
import { fechaRelativa } from '../lib/formato'
import { notifApi } from '../lib/endpoints'
import { desenvolver } from '../lib/api'
import { useApi } from '../hooks/useApi'
import type { Notificacion } from '../lib/tipos'
import { useDrawer } from './Drawer'
import { IcoCampana, IcoMenu } from './Iconos'
import { CargandoBloque, EstadoVacio } from './Estados'
import { color } from '../lib/tema'

export function AppHeader({ titulo }: { titulo: string }) {
  const insets = useSafeAreaInsets()
  const { abrir } = useDrawer()
  const { user } = useAuth()
  const [panelAbierto, setPanelAbierto] = useState(false)

  const perfil = user?.role ?? ''
  const destinoId =
    user?.role === 'OFICINA_REGIONAL'
      ? user.officeEntityId
      : user?.role === 'DISTRIBUIDOR'
        ? user.distributorEntityId
        : user?.role === 'KIOSCO'
          ? user.kioskEntityId
          : user?.employeeEntityId

  const cargar = useCallback(
    async () => {
      if (!perfil) return [] as Notificacion[]
      const r = await notifApi.mine(perfil, destinoId ?? null)
      return desenvolver(r) ?? []
    },
    [perfil, destinoId],
  )
  const { datos } = useApi<Notificacion[]>(cargar, [perfil, destinoId])
  const noLeidas = (datos ?? []).filter((n) => !n.leida).length

  return (
    <View style={[est.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={abrir} hitSlop={10} style={est.iconBtn}>
        <IcoMenu color={color.text} />
      </Pressable>
      <Text style={est.titulo} numberOfLines={1}>
        {titulo}
      </Text>
      <Pressable onPress={() => setPanelAbierto(true)} hitSlop={10} style={est.iconBtn}>
        <IcoCampana color={color.text} />
        {noLeidas > 0 && (
          <View style={est.badge}>
            <Text style={est.badgeTexto}>{noLeidas > 9 ? '9+' : noLeidas}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={panelAbierto} transparent animationType="fade" onRequestClose={() => setPanelAbierto(false)}>
        <Pressable style={est.velo} onPress={() => setPanelAbierto(false)} />
        <View style={[est.panel, { top: insets.top + 46 }]}>
          <View style={est.panelHead}>
            <Text style={est.panelTitulo}>Notificaciones</Text>
          </View>
          <ScrollView style={{ maxHeight: 380 }}>
            {datos === null ? (
              <CargandoBloque texto="Cargando…" />
            ) : datos.length === 0 ? (
              <EstadoVacio titulo="Sin notificaciones" detalle="No tienes avisos por ahora." />
            ) : (
              datos.map((n) => (
                <View key={n.id} style={[est.notif, !n.leida && est.notifNoLeida]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {!n.leida && <View style={est.dot} />}
                    <Text style={est.notifTitulo} numberOfLines={1}>
                      {n.titulo}
                    </Text>
                  </View>
                  <Text style={est.notifMsg}>{n.mensaje}</Text>
                  {n.fecha ? <Text style={est.notifFecha}>{fechaRelativa(n.fecha)}</Text> : null}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const est = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: color.white,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
  },
  iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  titulo: { flex: 1, fontSize: 16, fontWeight: '800', color: color.text, letterSpacing: -0.2 },
  badge: {
    position: 'absolute',
    top: 5,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: color.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTexto: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  velo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  panel: {
    position: 'absolute',
    right: 10,
    left: 10,
    backgroundColor: color.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.borderSoft,
    overflow: 'hidden',
    shadowColor: '#0B2A3B',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  panelHead: { padding: 14, borderBottomWidth: 1, borderBottomColor: color.borderSoft },
  panelTitulo: { fontSize: 14, fontWeight: '800', color: color.primary },
  notif: { padding: 12, borderBottomWidth: 1, borderBottomColor: color.borderSoft },
  notifNoLeida: { backgroundColor: color.primaryTint },
  dot: { width: 8, height: 8, borderRadius: 99, backgroundColor: color.primary },
  notifTitulo: { flex: 1, fontSize: 13.5, fontWeight: '700', color: color.text },
  notifMsg: { fontSize: 12.5, color: color.text2, marginTop: 3 },
  notifFecha: { fontSize: 11, color: color.text4, marginTop: 4 },
})
