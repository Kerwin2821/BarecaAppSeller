import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Tarjeta } from '../Ui'
import { Spinner } from '../Estados'
import { color } from '@/lib/tema'
import { ETIQUETA_PARENTESCO, TIPOS_DOC_EXPEDIENTE, type AtaWizard } from '@/lib/atualcance'

const esImagen = (u?: string) => !!u && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)

/** Un recaudo del expediente: estado, vista previa y botones para (re)cargarlo. */
function Recaudo({
  w,
  tipo,
  etiqueta,
  obligatorio,
  documentoAfiliado,
}: {
  w: AtaWizard
  tipo: string
  etiqueta: string
  obligatorio: boolean
  documentoAfiliado?: string
}) {
  const doc = w.documentoDe(tipo, documentoAfiliado)
  const subiendo = !!w.subiendo[w.claveDoc(tipo, documentoAfiliado)]
  return (
    <View style={est.recaudo}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={est.recTit}>
          {etiqueta} {obligatorio ? <Text style={{ color: color.danger }}>*</Text> : <Text style={est.opcional}>(opcional)</Text>}
        </Text>
        {doc ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {esImagen(doc.urlS3) ? <Image source={{ uri: doc.urlS3 }} style={est.miniatura} /> : null}
            <Text style={est.recOk} numberOfLines={1}>✓ {doc.nombreArchivo || 'Cargado'}</Text>
          </View>
        ) : (
          <Text style={est.recPend}>{subiendo ? 'Subiendo…' : 'Sin cargar'}</Text>
        )}
      </View>
      <View style={{ gap: 6, alignItems: 'flex-end' }}>
        {subiendo ? (
          <Spinner />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable onPress={() => void w.cargarDocumento('camara', tipo, documentoAfiliado)} style={est.btn}><Text style={est.btnTxt}>📷</Text></Pressable>
              <Pressable onPress={() => void w.cargarDocumento('galeria', tipo, documentoAfiliado)} style={[est.btn, est.btnSoft]}><Text style={[est.btnTxt, { color: color.primary }]}>🖼</Text></Pressable>
            </View>
            {doc ? (
              <Pressable onPress={() => w.quitarDocumento(tipo, documentoAfiliado)} hitSlop={6}>
                <Text style={{ fontSize: 11, color: color.danger, fontWeight: '700' }}>Quitar</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  )
}

export function AtaExpediente({ w }: { w: AtaWizard }) {
  return (
    <View style={{ gap: 12 }}>
      <Tarjeta style={{ padding: 18, gap: 12 }}>
        <Text style={est.seccion}>Recaudos del expediente</Text>
        <Text style={est.hint}>
          Las cédulas leídas con el OCR ya quedaron cargadas. Todo se guarda en el expediente digital del cliente, disponible para Latina Salud.
        </Text>
        {TIPOS_DOC_EXPEDIENTE.map((d) => (
          <Recaudo key={d.tipo} w={w} tipo={d.tipo} etiqueta={d.etiqueta} obligatorio={d.obligatorio} />
        ))}
      </Tarjeta>

      {w.beneficiarios.length ? (
        <Tarjeta style={{ padding: 18, gap: 12 }}>
          <Text style={est.seccion}>Cédula o partida de nacimiento de cada beneficiario</Text>
          {w.beneficiarios.map((b, i) => (
            <Recaudo
              key={b.clave}
              w={w}
              tipo="CI_AFILIADO"
              etiqueta={`${ETIQUETA_PARENTESCO[b.parentesco] ?? 'Beneficiario'} ${i + 1}${b.persona.nombres ? ` · ${b.persona.nombres}` : ''}`}
              obligatorio
              documentoAfiliado={b.persona.numeroDocumento}
            />
          ))}
        </Tarjeta>
      ) : null}
    </View>
  )
}

const est = StyleSheet.create({
  seccion: { fontSize: 14.5, fontWeight: '900', color: color.primary },
  hint: { fontSize: 12, color: color.text3, lineHeight: 17 },
  recaudo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: color.borderSoft, backgroundColor: color.primaryTint },
  recTit: { fontSize: 13, fontWeight: '800', color: color.text },
  opcional: { fontSize: 11, color: color.text4, fontWeight: '500' },
  recOk: { fontSize: 12, color: color.success, fontWeight: '700', flexShrink: 1 },
  recPend: { fontSize: 12, color: color.text3 },
  miniatura: { width: 40, height: 40, borderRadius: 6, backgroundColor: color.border },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: color.primary },
  btnSoft: { backgroundColor: color.primaryLight },
  btnTxt: { fontSize: 14, color: '#fff' },
})
