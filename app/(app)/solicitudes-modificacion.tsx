import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { modificationApi } from '@/lib/endpoints'
import { actorUuid } from '@/lib/roles'
import { fechaRelativa } from '@/lib/formato'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Pildora, Tarjeta } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

function colorEstado(status: string): { c: string; t: string } {
  const s = (status || '').toUpperCase()
  if (s === 'APPROVED' || s === 'APROBADA') return { c: color.success, t: 'Aprobada' }
  if (s === 'REJECTED' || s === 'RECHAZADA') return { c: color.danger, t: 'Rechazada' }
  if (s === 'PENDING' || s === 'PENDIENTE') return { c: color.warning, t: 'Pendiente' }
  return { c: color.text3, t: status || '—' }
}

/** Resume el objeto `changes` en una línea legible. */
function resumenCambios(changes: any): string {
  if (!changes || typeof changes !== 'object') return 'Cambios solicitados'
  const claves = Object.keys(changes)
  if (claves.length === 0) return 'Cambios solicitados'
  return claves.slice(0, 3).join(', ')
}

export default function SolicitudesModificacion() {
  const { user } = useAuth()

  const cargar = useCallback(async () => {
    if (!user) return [] as any[]
    const parentId = actorUuid(user) ?? ''
    if (!parentId) return [] as any[]
    const r = await modificationApi.lista(user.role, parentId)
    return Array.isArray(r) ? r : ((r as any)?.data ?? [])
  }, [user])
  const { datos, cargando, error, recargar } = useApi<any[]>(cargar, [user?.loginId])

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla
        titulo="Solicitudes de Modificación"
        detalle="Cambios sobre pólizas emitidas de tu red comercial"
      />

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : cargando ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Tarjeta key={i} style={{ padding: 16 }}>
              <Skeleton w="50%" h={13} />
              <Skeleton w="75%" h={11} style={{ marginTop: 10 }} />
            </Tarjeta>
          ))}
        </View>
      ) : (datos ?? []).length === 0 ? (
        <Tarjeta>
          <EstadoVacio titulo="Sin solicitudes" detalle="No hay solicitudes de modificación en tu red." />
        </Tarjeta>
      ) : (
        <View style={{ gap: 12 }}>
          {(datos ?? []).map((s, i) => {
            const est = colorEstado(s.status)
            const solicitante = `${s.requester?.firstName ?? ''} ${s.requester?.lastName ?? ''}`.trim()
            return (
              <Tarjeta key={s.id ?? i} style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={stl.poliza} numberOfLines={1}>
                      Póliza Nº {s.policyNumber || s.policyId || '—'}
                    </Text>
                    <Text style={stl.cambios} numberOfLines={2}>
                      {resumenCambios(s.changes)}
                    </Text>
                    {solicitante ? <Text style={stl.solicitante}>Solicita: {solicitante}</Text> : null}
                    {s.createdAt ? <Text style={stl.fecha}>{fechaRelativa(s.createdAt)}</Text> : null}
                  </View>
                  <Pildora color={est.c} texto={est.t} />
                </View>
              </Tarjeta>
            )
          })}
        </View>
      )}
    </Pantalla>
  )
}

const stl = StyleSheet.create({
  poliza: { fontSize: 13.5, fontWeight: '800', color: color.text, fontFamily: fuenteMono },
  cambios: { fontSize: 12.5, color: color.text2, marginTop: 4 },
  solicitante: { fontSize: 11.5, color: color.text3, marginTop: 4 },
  fecha: { fontSize: 11, color: color.text4, marginTop: 3 },
})
