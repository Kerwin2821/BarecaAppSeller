import { NuevaVentaWizard } from '@/components/NuevaVentaWizard'

/** Flujo express de RCV (menos pasos, emisión rápida). */
export default function NuevaVentaExpress() {
  return <NuevaVentaWizard ramo="rcv" express />
}
