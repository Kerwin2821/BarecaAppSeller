import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { ATA_PASOS, useAtaWizard } from '@/lib/atualcance'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { CargandoBloque, EstadoError } from '@/components/Estados'
import { Alerta, Boton } from '@/components/Ui'
import { AtaSolicitud } from '@/components/ata/AtaSolicitud'
import { AtaExpediente } from '@/components/ata/AtaExpediente'
import { AtaResumen } from '@/components/ata/AtaResumen'
import { AtaCobro } from '@/components/ata/AtaCobro'
import { color } from '@/lib/tema'

/**
 * Venta de A TU ALCANCE (medicina prepagada · Latina Salud). Tres pasos y el
 * resultado con el cobro de la cuota 1 — misma estructura que el portal web.
 */
export default function AtaVenta() {
  const { user } = useAuth()
  const router = useRouter()
  const w = useAtaWizard(user)

  const idx = ATA_PASOS.findIndex((p) => p.id === w.paso)
  const enResultado = w.paso === 'resultado'

  return (
    <Pantalla>
      <CabeceraPantalla titulo="💚 A Tu Alcance" detalle="Medicina prepagada · Latina Salud · cuota semanal desde $7" />

      {/* Stepper */}
      <View style={est.stepper}>
        {ATA_PASOS.map((p, i) => {
          const hecho = enResultado || i < idx
          const activo = !enResultado && i === idx
          return (
            <View key={p.id} style={est.step}>
              <View style={[est.stepNum, hecho && est.stepHecho, activo && est.stepActivo]}>
                <Text style={[est.stepNumTxt, (hecho || activo) && { color: '#fff' }]}>{hecho ? '✓' : p.numero}</Text>
              </View>
              <Text style={[est.stepLbl, activo && { color: color.primary, fontWeight: '800' }]}>{p.label}</Text>
            </View>
          )
        })}
      </View>

      {w.error ? <View style={{ marginBottom: 10 }}><Alerta tipo="error">{w.error}</Alerta></View> : null}

      {!w.catalogo && w.cargando ? (
        <CargandoBloque texto="Cargando el producto…" />
      ) : !w.catalogo ? (
        <EstadoError mensaje={w.error || 'No se pudo cargar el catálogo del producto.'} onReintentar={() => router.replace('/atualcance' as never)} />
      ) : w.paso === 'solicitud' ? (
        <AtaSolicitud w={w} />
      ) : w.paso === 'expediente' ? (
        <AtaExpediente w={w} />
      ) : w.paso === 'resumen' ? (
        <AtaResumen w={w} />
      ) : (
        <AtaCobro w={w} onNuevaVenta={w.reiniciar} />
      )}

      {/* Faltantes + navegación (no en el resultado) */}
      {w.catalogo && !enResultado ? (
        <View style={{ gap: 10, marginTop: 14 }}>
          {!w.puedeContinuar && w.paso !== 'resumen' ? (
            <View style={est.faltanBox}>
              <Text style={est.faltanTitulo}>Para continuar, completa:</Text>
              {w.faltantes.slice(0, 8).map((f) => <Text key={f} style={est.faltanItem}>• {f}</Text>)}
              {w.faltantes.length > 8 ? <Text style={est.faltanItem}>… y {w.faltantes.length - 8} más</Text> : null}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {idx > 0 ? <Boton texto="← Atrás" variante="soft" onPress={w.anterior} style={{ flex: 1 }} /> : null}
            {w.paso !== 'resumen' ? (
              <Boton texto={w.paso === 'solicitud' ? 'Continuar — Expediente' : 'Continuar — Resumen'} onPress={w.continuar} disabled={!w.puedeContinuar} style={{ flex: 1.5 }} />
            ) : null}
          </View>
          <Pressable onPress={() => router.navigate('/atualcance/cartera' as never)} style={{ alignSelf: 'center', paddingVertical: 6 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: color.primary }}>Ver mi cartera y cobranza ›</Text>
          </Pressable>
        </View>
      ) : null}
    </Pantalla>
  )
}

const est = StyleSheet.create({
  stepper: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, paddingHorizontal: 4 },
  step: { alignItems: 'center', flex: 1, gap: 4 },
  stepNum: { width: 30, height: 30, borderRadius: 15, backgroundColor: color.white, borderWidth: 1.5, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  stepHecho: { backgroundColor: color.success, borderColor: color.success },
  stepActivo: { backgroundColor: color.primary, borderColor: color.primary },
  stepNumTxt: { fontSize: 12.5, fontWeight: '900', color: color.text3 },
  stepLbl: { fontSize: 11, color: color.text3, fontWeight: '600' },
  faltanBox: { padding: 12, borderRadius: 12, backgroundColor: '#FFF7DB', borderWidth: 1, borderColor: '#F3D77B', gap: 3 },
  faltanTitulo: { fontSize: 12.5, fontWeight: '800', color: '#8A5A00' },
  faltanItem: { fontSize: 12, color: '#6B4A00' },
})
