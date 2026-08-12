import { useState, type ComponentType } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../lib/auth'
import { puedeGestionarEquipo, puedeVender } from '../lib/roles'
import type { UserRole } from '../lib/tipos'
import { IcoComisiones, IcoEquipo, IcoHome, IcoPerfil, IcoPolizas, IcoRachas, IcoVenta } from './Iconos'
import { Boton } from './Ui'
import { color } from '../lib/tema'

type Paso = {
  Ico: ComponentType<{ color: string; size?: number }>
  titulo: string
  desc: string
  visible?: (rol: UserRole | null | undefined) => boolean
}

const PASOS: Paso[] = [
  { Ico: IcoHome, titulo: 'Tu inicio', desc: 'Aquí ves tu comisión acumulada, tu meta del día y tus últimas pólizas vendidas.' },
  { Ico: IcoVenta, titulo: 'Vender', desc: 'Con el botón central cotizas y emites una póliza RCV en pocos pasos.', visible: puedeVender },
  { Ico: IcoPolizas, titulo: 'Mis Ventas', desc: 'Consulta todas tus pólizas emitidas, su estado y sus documentos.' },
  { Ico: IcoComisiones, titulo: 'Comisiones', desc: 'Revisa lo generado y solicita el retiro de tu comisión en tiempo real.' },
  { Ico: IcoRachas, titulo: 'Rachas', desc: 'Cumple tu meta diaria y gana premios manteniendo tu racha de ventas.' },
  { Ico: IcoEquipo, titulo: 'Gestión de Equipo', desc: 'Administra tu red: oficinas, distribuidores y kioscos.', visible: puedeGestionarEquipo },
  { Ico: IcoPerfil, titulo: 'Tu perfil', desc: 'Tus datos, seguridad (huella) y métodos de cobro para tus retiros.' },
]

/**
 * Visita guiada del app (primera vez, dentro del home). Explica para qué sirve
 * cada funcionalidad. Se puede saltar o finalizar en cualquier momento.
 */
export function VisitaGuiada({ visible, onFinalizar }: { visible: boolean; onFinalizar: () => void }) {
  const { user } = useAuth()
  const [i, setI] = useState(0)

  if (!visible) return null
  const pasos = PASOS.filter((p) => !p.visible || p.visible(user?.role))
  const paso = pasos[Math.min(i, pasos.length - 1)]
  const ultimo = i >= pasos.length - 1
  const avanzar = () => (ultimo ? onFinalizar() : setI((v) => v + 1))

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFinalizar} statusBarTranslucent>
      <View style={est.velo}>
        <View style={est.card}>
          <View style={est.circ}>
            <paso.Ico color={color.accent} size={30} />
          </View>
          <Text style={est.paso}>
            {i + 1} de {pasos.length}
          </Text>
          <Text style={est.titulo}>{paso.titulo}</Text>
          <Text style={est.desc}>{paso.desc}</Text>

          <View style={est.dots}>
            {pasos.map((_, k) => (
              <View key={k} style={[est.dot, k === i && est.dotOn]} />
            ))}
          </View>

          <Boton
            texto={ultimo ? 'Finalizar' : 'Siguiente'}
            variante="accent"
            onPress={avanzar}
            style={{ alignSelf: 'stretch', marginTop: 6 }}
          />
          {!ultimo ? (
            <Pressable onPress={onFinalizar} hitSlop={8} style={{ marginTop: 12 }}>
              <Text style={est.saltar}>Saltar intro</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const est = StyleSheet.create({
  velo: { flex: 1, backgroundColor: 'rgba(16,20,40,0.62)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: color.white,
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingVertical: 26,
    alignItems: 'center',
  },
  circ: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(241,89,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paso: { fontSize: 11, fontWeight: '800', color: color.accent, letterSpacing: 0.5, marginTop: 14 },
  titulo: { fontSize: 19, fontWeight: '900', color: color.text, marginTop: 4, textAlign: 'center', letterSpacing: -0.3 },
  desc: { fontSize: 13.5, color: color.text2, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 18, marginBottom: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.border },
  dotOn: { width: 18, backgroundColor: color.accent },
  saltar: { fontSize: 12.5, fontWeight: '700', color: color.text3 },
})
