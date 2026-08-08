import { EnConstruccion } from '@/components/EnConstruccion'

/** Mapa de Conexiones: red comercial geolocalizada. */
export default function MapaConexiones() {
  return (
    <EnConstruccion
      titulo="Mapa de Conexiones"
      descripcion="Vista geolocalizada de la red comercial (subárbol de la jerarquía) sobre un mapa. Se apoya en react-native-maps y el subárbol de transacciones; se completa con datos reales de una sesión de QA."
      endpoints={['/api/comision-transaccions/v1/transacciones/subarbol']}
    />
  )
}
