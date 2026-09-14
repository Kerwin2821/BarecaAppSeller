import { useCallback, useState } from 'react'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { cascoInspeccionApi, type Inspeccion } from '@/lib/endpoints'
import { mensajeDeError } from '@/lib/api'
import { actorUuid } from '@/lib/roles'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { CargandoBloque, EstadoError, EstadoVacio } from '@/components/Estados'
import { Alerta, Boton, Pildora, Tarjeta } from '@/components/Ui'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { color } from '@/lib/tema'

/**
 * Inspecciones de Seguro de Auto (Casco) del vendedor: las que esperan a la app del
 * perito, las ya analizadas con IA (asegurable / con exclusiones / no asegurable) y
 * las incompletas. Espejo de «Inspecciones de Casco» del portal web.
 *
 * Retomar la venta desde aquí requiere el asistente de Seguro de Auto, que el app
 * aún no tiene: por ahora se consulta el veredicto y se continúa desde el portal.
 */

function estadoLabel(e?: string | null): string {
  switch (e) {
    case 'PENDIENTE': return 'Pendiente de inspección'
    case 'ANALIZANDO': return 'Analizando con IA'
    case 'APROBADA': return 'Asegurable — lista para continuar'
    case 'APROBADA_CON_ANEXO': return 'Asegurable con exclusiones'
    case 'RECHAZADA': return 'No asegurable'
    case 'INCOMPLETA': return 'Incompleta — reintentar'
    default: return e ?? '—'
  }
}
function estadoColor(e?: string | null): string {
  switch (e) {
    case 'APROBADA':
    case 'APROBADA_CON_ANEXO': return color.success
    case 'RECHAZADA': return color.danger
    case 'INCOMPLETA': return color.warning
    case 'ANALIZANDO': return color.primary
    default: return color.text3
  }
}
const fechaCorta = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function Inspecciones() {
  const { user } = useAuth()
  const { avisar } = useToast()
  const [sel, setSel] = useState<Inspeccion | null>(null)
  const [cargandoDet, setCargandoDet] = useState(false)

  const cargar = useCallback(async (): Promise<Inspeccion[]> => {
    if (!user) return []
    const uuid = actorUuid(user) ?? ''
    if (!uuid) return []
    const r = await cascoInspeccionApi.pendientes(user.role, uuid)
    return Array.isArray(r) ? r : ((r as any)?.data ?? [])
  }, [user])
  const { datos, cargando, error, recargar } = useApi<Inspeccion[]>(cargar, [user?.loginId])
  const items = datos ?? []

  const abrir = async (i: Inspeccion) => {
    setSel(i); setCargandoDet(true)
    try { setSel(await cascoInspeccionApi.detalle(i.id)) } catch (e) { avisar(mensajeDeError(e), 'error') } finally { setCargandoDet(false) }
  }

  const fotos = sel ? ([['Frontal', sel.frontalUrl], ['Izquierdo', sel.izquierdoUrl], ['Derecho', sel.derechoUrl], ['Posterior', sel.posteriorUrl], ['Serial motor', sel.serialMotorUrl], ['Tablero', sel.tableroUrl]] as const).filter(([, u]) => !!u) : []

  return (
    <Pantalla onRefresh={recargar}>
      <CabeceraPantalla titulo="🔍 Inspecciones" detalle="Seguro de Auto · veredicto de la inspección pericial con IA" />

      {error ? <EstadoError mensaje={error} onReintentar={recargar} /> : cargando && !datos ? <CargandoBloque texto="Cargando inspecciones…" /> : items.length === 0 ? (
        <Tarjeta><EstadoVacio titulo="Sin inspecciones pendientes" detalle="Las órdenes de inspección que crees para Seguro de Auto aparecerán aquí hasta que se usen en una venta." /></Tarjeta>
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((i) => (
            <Pressable key={i.id} onPress={() => void abrir(i)}>
              <Tarjeta style={[est.item, { borderLeftColor: estadoColor(i.estado) }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={est.titulo} numberOfLines={1}>{i.vehiculoDescripcion || [i.marca, i.modelo].filter(Boolean).join(' ') || 'Vehículo'} · {i.placaDeclarada || i.placa || '—'}</Text>
                    <Text style={est.sub}>{i.clienteNombre || 'Cliente'}{i.clienteCedula ? ` · ${i.clienteCedula}` : ''} · {fechaCorta(i.fecha)}</Text>
                  </View>
                  <Text style={{ color: color.text4, fontWeight: '900' }}>›</Text>
                </View>
                <Pildora texto={estadoLabel(i.estado)} color={estadoColor(i.estado)} />
              </Tarjeta>
            </Pressable>
          ))}
        </View>
      )}

      <Modal abierto={!!sel} onCerrar={() => setSel(null)} titulo="Inspección" subtitulo={sel ? `${sel.vehiculoDescripcion || [sel.marca, sel.modelo].filter(Boolean).join(' ') || ''} · ${sel.placaDeclarada || sel.placa || ''}` : undefined}>
        {!sel ? null : cargandoDet ? <CargandoBloque texto="Cargando…" /> : (
          <View style={{ gap: 12 }}>
            <Pildora texto={estadoLabel(sel.estado)} color={estadoColor(sel.estado)} />
            {sel.veredicto ? <Text style={est.sub}>Veredicto: <Text style={{ fontWeight: '800', color: color.text }}>{sel.veredicto}</Text>{sel.severidadMax ? ` · severidad ${sel.severidadMax}` : ''}</Text> : null}
            {sel.resumenSeveridad ? <Alerta tipo={sel.estado === 'RECHAZADA' ? 'error' : 'info'}>{sel.resumenSeveridad}</Alerta> : null}

            {sel.estado === 'PENDIENTE' ? (
              <Tarjeta style={{ padding: 14, gap: 8, backgroundColor: color.primaryTint }}>
                <Text style={est.seccion}>Esperando a la app del perito</Text>
                <Text style={est.sub}>La inspección se hace desde la app móvil de inspección con el código de esta orden. Cuando el perito la complete, el veredicto aparece aquí.</Text>
                {sel.token ? (
                  <View style={est.tokenBox}>
                    <Text style={est.tokenLbl}>Código de la orden</Text>
                    <Text style={est.token} selectable>{sel.token}</Text>
                  </View>
                ) : null}
              </Tarjeta>
            ) : null}

            <View style={{ gap: 4 }}>
              {sel.serialMotor ? <Text style={est.sub}>Serial motor: <Text style={{ color: color.text, fontWeight: '700' }}>{sel.serialMotor}</Text></Text> : null}
              {sel.odometro ? <Text style={est.sub}>Odómetro: <Text style={{ color: color.text, fontWeight: '700' }}>{sel.odometro}</Text></Text> : null}
              {sel.tableroEncendido != null ? <Text style={est.sub}>Tablero encendido: <Text style={{ color: color.text, fontWeight: '700' }}>{sel.tableroEncendido ? 'Sí' : 'No'}</Text></Text> : null}
            </View>

            {fotos.length ? (
              <View style={{ gap: 6 }}>
                <Text style={est.seccion}>Fotos analizadas</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {fotos.map(([n, u]) => (
                    <Pressable key={n} onPress={() => void Linking.openURL(u!)} style={{ width: '31%' }}>
                      <Image source={{ uri: u! }} style={est.foto} />
                      <Text style={est.fotoLbl}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {sel.anexoUrl ? <Boton texto="📎 Ver anexo de exclusiones" variante="soft" onPress={() => void Linking.openURL(sel.anexoUrl!)} /> : null}

            {sel.estado === 'APROBADA' || sel.estado === 'APROBADA_CON_ANEXO' ? (
              <Alerta tipo="exito">Lista para continuar la venta. Por ahora la emisión de Seguro de Auto se completa desde el portal web (Inspecciones › Retomar).</Alerta>
            ) : null}
          </View>
        )}
      </Modal>
    </Pantalla>
  )
}

const est = StyleSheet.create({
  item: { padding: 14, gap: 8, borderLeftWidth: 4 },
  titulo: { fontSize: 14, fontWeight: '800', color: color.text },
  sub: { fontSize: 11.5, color: color.text3, marginTop: 2, lineHeight: 16 },
  seccion: { fontSize: 13, fontWeight: '900', color: color.primary },
  tokenBox: { padding: 12, borderRadius: 12, backgroundColor: color.white, borderWidth: 1, borderColor: color.border, alignItems: 'center', gap: 4 },
  tokenLbl: { fontSize: 11, color: color.text3, fontWeight: '700' },
  token: { fontSize: 18, fontWeight: '900', color: color.primary, letterSpacing: 1.5 },
  foto: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: color.border },
  fotoLbl: { fontSize: 10.5, color: color.text3, textAlign: 'center', marginTop: 3, fontWeight: '600' },
})
