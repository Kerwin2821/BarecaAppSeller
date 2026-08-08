import { WizardOutline } from '@/components/Wizard'

/** Flujo express de RCV (menos pasos, para emisión rápida). */
export default function NuevaVentaExpress() {
  return (
    <WizardOutline
      titulo="Venta Rápida RCV"
      detalle="Emisión express de RCV en menos pasos"
      pasos={[
        { label: 'Vehículo y Plan', descripcion: 'Datos del vehículo y selección del plan RCV con la prima.' },
        { label: 'Cliente y Conductor', descripcion: 'Titular y conductor en un solo paso (con OCR de cédula).' },
        { label: 'Registro de Pago', descripcion: 'Pago móvil / referencia y emisión con cuadro y carnet.' },
      ]}
    />
  )
}
