import { EnConstruccion } from '@/components/EnConstruccion'

/** Mis Rachas: metas e incentivos del vendedor. */
export default function Rachas() {
  return (
    <EnConstruccion
      titulo="Mis Rachas"
      descripcion="Metas, retos e incentivos por volumen de ventas. La lógica de progreso y premios se calcula en el backend; la pantalla queda lista para consumirla en cuanto haya una sesión de QA con datos de retos."
      endpoints={['/api/retos', '/api/rachas (según el módulo de incentivos)']}
    />
  )
}
