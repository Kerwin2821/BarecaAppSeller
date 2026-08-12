import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../lib/auth'
import { actorUuid } from '../lib/roles'
import { fechaRelativa } from '../lib/formato'
import { notifApi } from '../lib/endpoints'
import { desenvolver } from '../lib/api'
import { useApi } from '../hooks/useApi'
import type { Notificacion } from '../lib/tipos'
import { useDrawer } from './Drawer'
import { useObjetivoTour } from '../lib/tour'
import { IcoAtras, IcoCampana, IcoMenu } from './Iconos'
import { CargandoBloque, EstadoVacio } from './Estados'
import { color } from '../lib/tema'

export function AppHeader({ titulo, onVolver }: { titulo: string; onVolver?: () => void }) {
  const insets = useSafeAreaInsets()
  const { abrir } = useDrawer()
  const { user } = useAuth()
  const [panelAbierto, setPanelAbierto] = useState(false)
  const refMenu = useObjetivoTour('menu')
  const refCampana = useObjetivoTour('campana')

  const perfil = user?.role ?? ''
  const destinoId =
    user?.role === 'OFICINA_REGIONAL'
      ? user.officeEntityId
      : user?.role === 'DISTRIBUIDOR'
        ? user.distributorEntityId
        : user?.role === 'KIOSCO'
          ? user.kioskEntityId
          : user?.employeeEntityId

  const loginId = user?.loginId ?? null
  const cargar = useCallback(
    async () => {
      if (!perfil) return { items: [] as Notificacion[], readIds: [] as number[] }
      const [rMine, rRead] = await Promise.all([
        notifApi.mine(perfil, destinoId ?? null),
        loginId ? notifApi.read(loginId).catch(() => null) : Promise.resolve(null),
      ])
      const items = desenvolver(rMine) ?? []
      const readIds = (rRead ? desenvolver(rRead) : []) ?? []
      return { items, readIds }
    },
    [perfil, destinoId, loginId],
  )
  const { datos } = useApi<{ items: Notificacion[]; readIds: number[] }>(cargar, [perfil, destinoId, loginId])
  const items = useMemo(() => datos?.items ?? [], [datos])

  // Leídas: se persisten por usuario en el dispositivo (AsyncStorage) y se
  // fusionan con las que el servidor ya tiene marcadas para este loginId. Así el
  // estado "leído" sobrevive al refrescar o remontar el header.
  const claveLeidas = loginId ? `bareca.notifLeidas.${loginId}` : null
  const [leidas, setLeidas] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!claveLeidas) return
    AsyncStorage.getItem(claveLeidas).then((v) => {
      if (!v) return
      try {
        const arr = JSON.parse(v) as number[]
        setLeidas((s) => new Set([...s, ...arr.map(Number)]))
      } catch {
        /* noop */
      }
    })
  }, [claveLeidas])

  useEffect(() => {
    const srv = datos?.readIds
    if (!srv?.length) return
    setLeidas((s) => new Set([...s, ...srv.map(Number)]))
  }, [datos])

  const esLeida = (n: Notificacion) => n.leida || leidas.has(Number(n.id))
  const noLeidas = items.filter((n) => !esLeida(n)).length

  const persistir = (nx: Set<number>) => {
    if (claveLeidas) AsyncStorage.setItem(claveLeidas, JSON.stringify([...nx])).catch(() => {})
  }
  const marcarLeida = (n: Notificacion) => {
    if (esLeida(n) || !loginId) return
    setLeidas((s) => {
      const nx = new Set(s).add(Number(n.id))
      persistir(nx)
      return nx
    })
    notifApi.markRead(loginId, Number(n.id)).catch(() => {})
  }
  const marcarTodas = () => {
    if (!loginId || !items.length) return
    const pend = items.filter((n) => !esLeida(n))
    if (!pend.length) return
    setLeidas((s) => {
      const nx = new Set(s)
      pend.forEach((n) => nx.add(Number(n.id)))
      persistir(nx)
      return nx
    })
    pend.forEach((n) => notifApi.markRead(loginId, Number(n.id)).catch(() => {}))
  }

  return (
    <View style={[est.header, { paddingTop: insets.top + 8 }]}>
      {onVolver ? (
        <Pressable onPress={onVolver} hitSlop={10} style={est.iconBtn}>
          <IcoAtras color={color.text} size={22} />
        </Pressable>
      ) : null}
      <Pressable ref={refMenu} collapsable={false} onPress={abrir} hitSlop={10} style={est.iconBtn}>
        <IcoMenu color={color.text} />
      </Pressable>
      <Text style={est.titulo} numberOfLines={1}>
        {titulo}
      </Text>
      <Pressable ref={refCampana} collapsable={false} onPress={() => setPanelAbierto(true)} hitSlop={10} style={est.iconBtn}>
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
            {noLeidas > 0 ? (
              <Pressable onPress={marcarTodas} hitSlop={6}>
                <Text style={est.marcarTodas}>Marcar todas</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView style={{ maxHeight: 380 }}>
            {datos === null ? (
              <CargandoBloque texto="Cargando…" />
            ) : items.length === 0 ? (
              <EstadoVacio titulo="Sin notificaciones" detalle="No tienes avisos por ahora." />
            ) : (
              items.map((n) => {
                const leida = esLeida(n)
                return (
                  <Pressable
                    key={n.id}
                    onPress={() => marcarLeida(n)}
                    style={({ pressed }) => [est.notif, !leida && est.notifNoLeida, pressed && { opacity: 0.7 }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {!leida ? <View style={est.dot} /> : null}
                      <Text style={[est.notifTitulo, leida && { fontWeight: '600', color: color.text2 }]} numberOfLines={1}>
                        {n.titulo}
                      </Text>
                    </View>
                    <Text style={est.notifMsg}>{n.mensaje}</Text>
                    {n.fecha ? <Text style={est.notifFecha}>{fechaRelativa(n.fecha)}</Text> : null}
                  </Pressable>
                )
              })
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
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
  },
  panelTitulo: { fontSize: 14, fontWeight: '800', color: color.primary },
  marcarTodas: { fontSize: 11.5, fontWeight: '700', color: color.primary },
  notif: { padding: 12, borderBottomWidth: 1, borderBottomColor: color.borderSoft },
  notifNoLeida: { backgroundColor: color.primaryTint },
  dot: { width: 8, height: 8, borderRadius: 99, backgroundColor: color.primary },
  notifTitulo: { flex: 1, fontSize: 13.5, fontWeight: '700', color: color.text },
  notifMsg: { fontSize: 12.5, color: color.text2, marginTop: 3 },
  notifFecha: { fontSize: 11, color: color.text4, marginTop: 4 },
})
