import { NuevaVentaWizard } from '@/components/NuevaVentaWizard'

/** Flujo de venta tradicional (RCV / Casco). */
export default function NuevaVenta() {
  return <NuevaVentaWizard ramo="rcv" />
}
