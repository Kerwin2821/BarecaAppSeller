import { useRef } from 'react'
import { Modal as ModalRN, Pressable, StyleSheet, Text, View } from 'react-native'
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas'
import { color } from '@/lib/tema'

/**
 * Pad de firma manuscrita (pantalla completa). Usa react-native-signature-canvas, que
 * dibuja en un WebView y devuelve el trazo como PNG en base64 — sin módulos nativos.
 * La firma se guarda en S3 (vía BFF) y al contrato viaja solo su URL.
 */
export function FirmaPad({
  abierto,
  onCerrar,
  onFirmar,
  titulo = 'Firma del contratante',
}: {
  abierto: boolean
  onCerrar: () => void
  /** Recibe el PNG como data URI (`data:image/png;base64,...`). */
  onFirmar: (pngDataUri: string) => void
  titulo?: string
}) {
  const ref = useRef<SignatureViewRef>(null)

  // Estilo del lienzo dentro del WebView: sin botones propios (los pintamos nativos).
  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; margin: 0; }
    .m-signature-pad--body { border: none; }
    .m-signature-pad--footer { display: none; }
    body, html { background: #fff; }
  `

  return (
    <ModalRN visible={abierto} animationType="slide" onRequestClose={onCerrar}>
      <View style={est.root}>
        <View style={est.cabecera}>
          <Text style={est.titulo}>{titulo}</Text>
          <Text style={est.hint}>Firma con el dedo dentro del recuadro, como en tu cédula.</Text>
        </View>

        <View style={est.lienzo}>
          <SignatureScreen
            ref={ref}
            onOK={(sig) => {
              onFirmar(sig)
              onCerrar()
            }}
            onEmpty={() => undefined}
            webStyle={webStyle}
            imageType="image/png"
            penColor={color.primary}
            backgroundColor="#fff"
            trimWhitespace
            autoClear={false}
            descriptionText=""
          />
        </View>

        <View style={est.acciones}>
          <Pressable onPress={onCerrar} style={[est.btn, est.btnSoft]}>
            <Text style={est.btnSoftTxt}>Cancelar</Text>
          </Pressable>
          <Pressable onPress={() => ref.current?.clearSignature()} style={[est.btn, est.btnSoft]}>
            <Text style={est.btnSoftTxt}>Borrar</Text>
          </Pressable>
          <Pressable onPress={() => ref.current?.readSignature()} style={[est.btn, est.btnPri]}>
            <Text style={est.btnPriTxt}>Guardar firma</Text>
          </Pressable>
        </View>
      </View>
    </ModalRN>
  )
}

const est = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgApp },
  cabecera: { paddingTop: 54, paddingHorizontal: 20, paddingBottom: 10 },
  titulo: { fontSize: 18, fontWeight: '900', color: color.primary },
  hint: { fontSize: 12.5, color: color.text3, marginTop: 4 },
  lienzo: { flex: 1, margin: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: color.accent, backgroundColor: '#fff' },
  acciones: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 30 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  btnSoft: { backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  btnSoftTxt: { fontWeight: '800', color: color.text2 },
  btnPri: { backgroundColor: color.accent, flex: 1.6 },
  btnPriTxt: { fontWeight: '900', color: '#fff' },
})
