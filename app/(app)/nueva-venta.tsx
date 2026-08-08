import { WizardOutline } from '@/components/Wizard'

/** Flujo de venta tradicional (RCV / Casco / Funeraria). */
export default function NuevaVenta() {
  return (
    <WizardOutline
      titulo="Nueva Venta"
      detalle="Cotización y emisión de póliza, paso a paso"
      pasos={[
        { label: 'Cotización', descripcion: 'Vehículo, plan RCV/Casco y cálculo de prima (clasificación SUDEASEG).' },
        { label: 'Datos del Cliente', descripcion: 'Cédula/RIF con OCR, contacto y dirección del titular.' },
        { label: 'Conductor / Riesgo', descripcion: 'Datos del conductor y evaluación de riesgo.' },
        { label: 'Asegurados', descripcion: 'Asegurados adicionales de la póliza.' },
        { label: 'Inspección', descripcion: 'Inspección pericial del vehículo (cuando aplica).' },
        { label: 'Registro de Pago', descripcion: 'Pago móvil / referencia y emisión final con cuadro y carnet.' },
      ]}
    />
  )
}
