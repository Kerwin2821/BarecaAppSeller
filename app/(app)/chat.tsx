import { EnConstruccion } from '@/components/EnConstruccion'

/** Chat: conversaciones de soporte (Firestore). */
export default function Chat() {
  return (
    <EnConstruccion
      titulo="Chat"
      descripcion="Mensajería en tiempo real de los tickets de soporte, sobre Firebase Firestore (colección chats/ticket_<id>/messages, Anonymous Auth). Requiere la config de Firebase del proyecto y una sesión de QA para probar el envío."
      endpoints={['Firebase Firestore · chats/ticket_<id>/messages']}
    />
  )
}
