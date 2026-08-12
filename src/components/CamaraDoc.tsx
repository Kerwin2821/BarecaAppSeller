import { useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import type { ImagenElegida } from '../lib/ocr'
import { color } from '../lib/tema'

type TipoDoc = 'cedula' | 'carnet'

const MASK = 'rgba(0,0,0,0.62)'

/**
 * Cámara a pantalla completa con una MÁSCARA (marco) para encuadrar la cédula
 * venezolana o el carnet de circulación. Al capturar devuelve la foto en el
 * mismo formato que espera el OCR (`ImagenElegida`).
 */
export function CamaraDoc({
  visible,
  tipo,
  onCapturar,
  onCerrar,
}: {
  visible: boolean
  tipo: TipoDoc
  onCapturar: (foto: ImagenElegida) => void
  onCerrar: () => void
}) {
  const insets = useSafeAreaInsets()
  const { width: W, height: H } = useWindowDimensions()
  const [permiso, pedirPermiso] = useCameraPermissions()
  const camRef = useRef<CameraView>(null)
  const [tomando, setTomando] = useState(false)

  // Marco: ancho 88% de pantalla, proporción tarjeta (cédula ID-1 = 1.585).
  const fw = Math.min(W * 0.88, 460)
  const fh = fw / (tipo === 'cedula' ? 1.585 : 1.5)
  const lado = (W - fw) / 2
  const top = Math.max(insets.top + 70, (H - fh) / 2 - 50)

  const titulo = tipo === 'cedula' ? 'Encuadra tu cédula' : 'Encuadra el carnet de circulación'

  const tomar = async () => {
    if (tomando) return
    setTomando(true)
    try {
      const foto = await camRef.current?.takePictureAsync({ base64: true, quality: 0.75 })
      if (foto?.uri) onCapturar({ uri: foto.uri, base64: foto.base64 ?? undefined, mimeType: 'image/jpeg' })
    } catch {
      /* ignora: el usuario puede reintentar */
    } finally {
      setTomando(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {!permiso?.granted ? (
          <View style={est.permiso}>
            <Text style={est.permisoTxt}>Necesitamos permiso para usar la cámara y leer el documento.</Text>
            <Pressable onPress={() => void pedirPermiso()} style={est.permisoBtn}>
              <Text style={est.permisoBtnTxt}>Permitir cámara</Text>
            </Pressable>
            <Pressable onPress={onCerrar} hitSlop={10} style={{ marginTop: 14 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Cancelar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />

            {/* Máscara: paneles oscuros alrededor del marco transparente */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={[est.mask, { top: 0, left: 0, right: 0, height: top }]} />
              <View style={[est.mask, { top: top + fh, left: 0, right: 0, bottom: 0 }]} />
              <View style={[est.mask, { top, left: 0, width: lado, height: fh }]} />
              <View style={[est.mask, { top, right: 0, width: lado, height: fh }]} />
              <View style={[est.marco, { top, left: lado, width: fw, height: fh }]} />
              <Text style={[est.titulo, { top: top - 40, width: W }]}>{titulo}</Text>
              <Text style={[est.sub, { top: top + fh + 14, width: W }]}>
                Coloca el documento dentro del marco, con buena luz y sin reflejos.
              </Text>
            </View>

            {/* Cerrar */}
            <Pressable onPress={onCerrar} hitSlop={12} style={[est.cerrar, { top: insets.top + 10 }]}>
              <Text style={est.cerrarTxt}>✕</Text>
            </Pressable>

            {/* Disparador */}
            <View style={[est.barra, { paddingBottom: insets.bottom + 24 }]}>
              <Pressable onPress={tomar} disabled={tomando} style={({ pressed }) => [est.shutter, pressed && { opacity: 0.7 }]}>
                <View style={est.shutterIn} />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  )
}

const est = StyleSheet.create({
  mask: { position: 'absolute', backgroundColor: MASK },
  marco: { position: 'absolute', borderWidth: 2.5, borderColor: '#fff', borderRadius: 16 },
  titulo: { position: 'absolute', textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '800' },
  sub: { position: 'absolute', textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: 12.5, paddingHorizontal: 30, lineHeight: 17 },
  cerrar: { position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cerrarTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  barra: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.25)' },
  shutterIn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  permiso: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8 },
  permisoTxt: { color: '#fff', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 10 },
  permisoBtn: { backgroundColor: color.primary, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 26 },
  permisoBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
})
