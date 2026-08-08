import { EnConstruccion } from '@/components/EnConstruccion'

/** Gestión de Equipo: jerarquía comercial (oficinas, distribuidores, kioscos). */
export default function Equipo() {
  return (
    <EnConstruccion
      titulo="Gestión de Equipo"
      descripcion="Alta y administración de la jerarquía comercial que cuelga del usuario (Oficina Regional → Distribuidor → Kiosco), con sus comisiones por producto. El alta crea credenciales de acceso, por lo que se completa tras verificar el flujo con una sesión de QA."
      endpoints={[
        '/api/oficinas-regionales, /api/distribuidores, /api/kioscos',
        '/api/comisiones (asignación por producto)',
        '/api/auth/logins/v1/create-login (credenciales del subordinado)',
      ]}
    />
  )
}
