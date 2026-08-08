import { EnConstruccion } from '@/components/EnConstruccion'

/** Ajuste de Pagos: conciliación de pagos de pólizas. */
export default function AjustePagos() {
  return (
    <EnConstruccion
      titulo="Ajuste de Pagos"
      descripcion="Conciliación y ajuste de pagos de las pólizas (referencias de pago móvil / banco). Mueve dinero y estados de pago, así que se completa tras verificar el flujo con una sesión de QA y las reglas de la pasarela."
      endpoints={['/api/payments/config', '/api/pagos (conciliación)']}
    />
  )
}
