import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { ticketsApi } from '@/lib/endpoints'
import { fechaRelativa } from '@/lib/formato'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Avatar, Pildora, Tarjeta } from '@/components/Ui'
import { color } from '@/lib/tema'

function metaEstado(estado: string | undefined | null): { c: string; t: string } {
  const s = (estado || '').toUpperCase()
  if (s === 'CREADO') return { c: color.warning, t: 'Creado' }
  if (s === 'EN_PROCESO') return { c: color.primary, t: 'En proceso' }
  if (s === 'PROCESADO') return { c: color.success, t: 'Procesado' }
  if (s === 'RECHAZADO') return { c: color.danger, t: 'Rechazado' }
  return { c: color.text3, t: estado || '—' }
}

/**
 * Chat de soporte. Cada ticket es una conversación; el hilo en tiempo real vive
 * en Firebase Firestore (chats/ticket_<id>/messages). Aquí se listan las
 * conversaciones y se abre cada hilo tocándolo.
 */
export default function ChatLista() {
  const router = useRouter()
  const { user } = useAuth()

  const cargar = useCallback(async () => {
    if (!user?.loginId) return [] as any[]
    const r = await ticketsApi.mios(user.loginId)
    return Array.isArray(r) ? r : ((r as any)?.data ?? [])
  }, [user?.loginId])
  const { datos, cargando, error, recargar } = useApi<any[]>(cargar, [user?.loginId])

  const lista = datos ?? []

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla titulo="Chat" detalle="Conversaciones de tus tickets de soporte" />

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : cargando ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Tarjeta key={i} style={{ padding: 16, flexDirection: 'row', gap: 12 }}>
              <Skeleton w={40} h={40} r={20} />
              <View style={{ flex: 1 }}>
                <Skeleton w="55%" h={13} />
                <Skeleton w="80%" h={11} style={{ marginTop: 8 }} />
              </View>
            </Tarjeta>
          ))}
        </View>
      ) : lista.length === 0 ? (
        <Tarjeta>
          <EstadoVacio titulo="Sin conversaciones" detalle="Crea un ticket en Soporte para iniciar una conversación." />
        </Tarjeta>
      ) : (
        <View style={{ gap: 12 }}>
          {lista.map((t, i) => {
            const asunto = t?.asunto ?? t?.titulo ?? t?.tema ?? 'Conversación'
            const ultimo = t?.mensaje ?? t?.descripcion ?? 'Toca para ver el hilo'
            const fecha = t?.fecha ?? t?.createdAt ?? t?.fechaCreacion
            const est = metaEstado(t?.estado)
            return (
              <Pressable
                key={t?.id ?? i}
                onPress={() =>
                  t?.id && router.push({ pathname: '/chat/[id]', params: { id: String(t.id), asunto: String(asunto) } })
                }
                style={({ pressed }) => pressed && { opacity: 0.7 }}
              >
                <Tarjeta style={{ padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Avatar texto={String(asunto).slice(0, 2).toUpperCase()} size={42} invertido />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={stl.asunto} numberOfLines={1}>
                      {asunto}
                    </Text>
                    <Text style={stl.ultimo} numberOfLines={1}>
                      {ultimo}
                    </Text>
                    {fecha ? <Text style={stl.fecha}>{fechaRelativa(fecha)}</Text> : null}
                  </View>
                  <Pildora color={est.c} texto={est.t} />
                  <Text style={{ fontSize: 18, color: color.text4 }}>›</Text>
                </Tarjeta>
              </Pressable>
            )
          })}
        </View>
      )}
    </Pantalla>
  )
}

const stl = StyleSheet.create({
  asunto: { fontSize: 13.5, fontWeight: '800', color: color.text },
  ultimo: { fontSize: 12, color: color.text2, marginTop: 2 },
  fecha: { fontSize: 10.5, color: color.text4, marginTop: 3 },
})
