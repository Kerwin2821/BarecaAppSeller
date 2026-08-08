import { EnConstruccion } from '@/components/EnConstruccion'

/** Soporte: tickera de ayuda. */
export default function Soporte() {
  return (
    <EnConstruccion
      titulo="Soporte"
      descripcion="Creación y seguimiento de tickets de soporte (CREADO → EN_PROCESO → PROCESADO/RECHAZADO). El chat de cada ticket usa Firestore; la pantalla queda lista para listar y abrir tickets con una sesión de QA."
      endpoints={['/api/tickets', '/api/tickets/{id} (estados y detalle)']}
    />
  )
}
