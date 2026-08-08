import { EnConstruccion } from '@/components/EnConstruccion'

/** Solicitudes de Modificación sobre pólizas emitidas. */
export default function SolicitudesModificacion() {
  return (
    <EnConstruccion
      titulo="Solicitudes de Modificación"
      descripcion="Solicitudes de cambio sobre pólizas ya emitidas (datos del titular, vehículo, coberturas) y su aprobación por el nivel superior de la jerarquía. La pantalla queda lista para listar y crear solicitudes con una sesión de QA."
      endpoints={['/api/solicitudes-modificacion']}
    />
  )
}
