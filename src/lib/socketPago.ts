/**
 * socketPago — canal en TIEMPO REAL del estado del pago móvil, 1:1 con la web
 * (`core/services/socket.service.ts` del portal + `services/socket.service.js` del BFF).
 *
 * "El mismo servidor de la web": el BFF corre un servidor socket.io. El cliente se une
 * a la sala de su `numeroOrden` con el evento `join-order-room` y recibe
 * `payment-status-update` en cuanto el banco notifica el pago móvil y el core procesa
 * la póliza. Payload: `{ status: 'SUCCESS'|'FAILURE', policyNumber, details }`.
 *
 * El socket del BFF NO exige auth y su CORS acepta conexiones sin `Origin` (apps
 * móviles), así que la app puede conectarse igual que el portal. El polling HTTP de
 * `/webhook/status/:numeroOrden` (en emisionPago) queda como respaldo si el socket no
 * conecta (p. ej. si el proxy no permite el upgrade WebSocket).
 */
import { io, type Socket } from 'socket.io-client'
import { BFF_URL, cookieSesionActual } from './api'

export interface PagoStatusUpdate {
  status?: 'SUCCESS' | 'FAILURE' | 'PENDING' | string
  policyNumber?: string
  details?: unknown
}

let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    const cookie = cookieSesionActual()
    socket = io(BFF_URL, {
      // En React Native conviene forzar el transporte WebSocket (evita el fallback a
      // XHR-polling, que es poco fiable en RN). Si el WS no conecta, el respaldo por
      // HTTP-polling de emisionPago cubre la detección del pago igual.
      transports: ['websocket'],
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      // Igual que la web (withCredentials): mandamos la cookie de sesión por robustez,
      // aunque el socket del BFF no la exija hoy.
      ...(cookie ? { extraHeaders: { Cookie: cookie } } : {}),
    })
  }
  return socket
}

/**
 * Escucha el estado del pago móvil de una orden en tiempo real. Devuelve una función
 * de limpieza que abandona la sala y quita el listener (llámala al terminar/cancelar).
 */
export function escucharPagoMovil(orderId: string, onUpdate: (d: PagoStatusUpdate) => void): () => void {
  if (!orderId) return () => {}
  const s = getSocket()

  const handler = (data: PagoStatusUpdate) => {
    try {
      onUpdate(data ?? {})
    } catch {
      /* nunca romper el socket por un throw del callback */
    }
  }
  s.on('payment-status-update', handler)

  const unirse = () => s.emit('join-order-room', orderId)
  if (s.connected) unirse()
  else {
    s.once('connect', unirse)
    s.connect()
  }

  return () => {
    try {
      s.emit('leave-order-room', orderId)
    } catch {
      /* ignore */
    }
    s.off('payment-status-update', handler)
    s.off('connect', unirse)
  }
}
