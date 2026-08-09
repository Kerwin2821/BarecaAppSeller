import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { ticketsApi } from '@/lib/endpoints'
import { mensajeDeError } from '@/lib/api'
import { fechaRelativa } from '@/lib/formato'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Boton, Campo, Pildora, Tarjeta } from '@/components/Ui'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { color } from '@/lib/tema'

/** Color + etiqueta legible según el estado de la tickera (CREADO → EN_PROCESO → PROCESADO/RECHAZADO). */
function metaEstado(estado: string | undefined | null): { c: string; t: string } {
  const s = (estado || '').toUpperCase()
  if (s === 'CREADO') return { c: color.warning, t: 'Creado' }
  if (s === 'EN_PROCESO') return { c: color.primary, t: 'En proceso' }
  if (s === 'PROCESADO') return { c: color.success, t: 'Procesado' }
  if (s === 'RECHAZADO') return { c: color.danger, t: 'Rechazado' }
  return { c: color.text3, t: estado || '—' }
}

/** Soporte: tickera de ayuda del vendedor (listar + crear). */
export default function Soporte() {
  const { user } = useAuth()
  const { avisar } = useToast()

  const cargar = useCallback(async () => {
    if (!user?.loginId) return [] as any[]
    const r = await ticketsApi.mios(user.loginId)
    return Array.isArray(r) ? r : ((r as any)?.data ?? [])
  }, [user?.loginId])
  const { datos, cargando, error, recargar } = useApi<any[]>(cargar, [user?.loginId])

  const [modalAbierto, setModalAbierto] = useState(false)
  const [asunto, setAsunto] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cerrarModal = useCallback(() => {
    if (enviando) return
    setModalAbierto(false)
  }, [enviando])

  const enviar = useCallback(async () => {
    const a = asunto.trim()
    const m = mensaje.trim()
    if (!a || !m) {
      avisar('Completa el asunto y el mensaje.', 'error')
      return
    }
    if (!user?.loginId) {
      avisar('Tu sesión no está lista. Intenta de nuevo.', 'error')
      return
    }
    setEnviando(true)
    try {
      await ticketsApi.crear({ asunto: a, mensaje: m, loginId: user.loginId })
      avisar('Ticket enviado. Te responderemos pronto.', 'ok')
      setAsunto('')
      setMensaje('')
      setModalAbierto(false)
      recargar()
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    } finally {
      setEnviando(false)
    }
  }, [asunto, mensaje, user?.loginId, avisar, recargar])

  const lista = datos ?? []

  return (
    <Pantalla onRefresh={recargar}>
      <View style={stl.encabezado}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <CabeceraPantalla titulo="Soporte" detalle="Tus tickets de ayuda" />
        </View>
        <Boton texto="+ Nuevo ticket" variante="mini" onPress={() => setModalAbierto(true)} />
      </View>

      {error ? (
        <EstadoError mensaje={error} onReintentar={recargar} />
      ) : cargando ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Tarjeta key={i} style={{ padding: 16 }}>
              <Skeleton w="50%" h={13} />
              <Skeleton w="80%" h={11} style={{ marginTop: 10 }} />
              <Skeleton w="30%" h={10} style={{ marginTop: 10 }} />
            </Tarjeta>
          ))}
        </View>
      ) : lista.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            titulo="Sin tickets"
            detalle="No has creado tickets de soporte todavía."
            accion={<Boton texto="+ Nuevo ticket" variante="mini" onPress={() => setModalAbierto(true)} />}
          />
        </Tarjeta>
      ) : (
        <View style={{ gap: 12 }}>
          {lista.map((t, i) => {
            const asuntoTxt = t?.asunto ?? t?.titulo ?? t?.tema ?? 'Sin asunto'
            const mensajeTxt = t?.mensaje ?? t?.descripcion ?? ''
            const fecha = t?.fecha ?? t?.createdAt ?? t?.fechaCreacion
            const est = metaEstado(t?.estado)
            return (
              <Tarjeta key={t?.id ?? i} style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={stl.asunto} numberOfLines={1}>
                      {asuntoTxt}
                    </Text>
                    {mensajeTxt ? (
                      <Text style={stl.mensaje} numberOfLines={2}>
                        {mensajeTxt}
                      </Text>
                    ) : null}
                    {fecha ? <Text style={stl.fecha}>{fechaRelativa(fecha)}</Text> : null}
                  </View>
                  <Pildora color={est.c} texto={est.t} />
                </View>
              </Tarjeta>
            )
          })}
        </View>
      )}

      <Modal
        abierto={modalAbierto}
        onCerrar={cerrarModal}
        titulo="Nuevo ticket"
        subtitulo="Cuéntanos en qué podemos ayudarte"
      >
        <View style={{ gap: 14 }}>
          <Campo
            etiqueta="Asunto"
            placeholder="Ej. No puedo emitir una póliza"
            value={asunto}
            onChangeText={setAsunto}
            maxLength={120}
            returnKeyType="next"
          />
          <Campo
            etiqueta="Mensaje"
            placeholder="Describe tu problema con el mayor detalle posible"
            value={mensaje}
            onChangeText={setMensaje}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={1000}
          />
          <Boton texto="Enviar" onPress={enviar} cargando={enviando} disabled={enviando} />
        </View>
      </Modal>
    </Pantalla>
  )
}

const stl = StyleSheet.create({
  encabezado: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  asunto: { fontSize: 14, fontWeight: '800', color: color.text },
  mensaje: { fontSize: 12.5, color: color.text2, marginTop: 4, lineHeight: 17.5 },
  fecha: { fontSize: 11, color: color.text4, marginTop: 6 },
})
