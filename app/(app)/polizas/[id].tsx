import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { fetchPolizas, type CategoriaPoliza } from '@/lib/polizas'
import { policyApi } from '@/lib/endpoints'
import { desenvolver, mensajeDeError } from '@/lib/api'
import { fechaCorta, moneda } from '@/lib/formato'
import type { DisplayPolicy, PolicyStatus } from '@/lib/tipos'
import { Pantalla } from '@/components/Pantalla'
import { CargandoBloque, EstadoError, Skeleton } from '@/components/Estados'
import { useToast } from '@/components/Toast'
import { Boton, Chip, Pildora, Tarjeta, TituloSeccion } from '@/components/Ui'
import { color, fuenteMono } from '@/lib/tema'

const COLOR_ESTADO: Record<PolicyStatus, string> = {
  Vigente: color.vigente,
  Inactiva: color.inactiva,
  Procesado: color.procesado,
  Otro: color.text3,
}

/** Texto (con formato WhatsApp) que alude a la póliza, para el botón Compartir. */
function textoCompartir(p: DisplayPolicy): string {
  const catTxt = p.category === 'auto' ? 'Casco' : p.category === 'funeral' ? 'Funeraria' : 'RCV'
  const lineas = [
    `🛡️ *Póliza ${catTxt} · Bareca*`,
    '',
    `📄 Nº de póliza: *${p.policyNumber || '—'}*`,
    `🏢 Aseguradora: ${p.productName}`,
    `👤 Titular: ${p.clientName}${p.clientDocument ? ` (${p.clientDocument})` : ''}`,
  ]
  if (p.vehicleDetails?.plate) {
    const veh = [p.vehicleDetails.make, p.vehicleDetails.model, p.vehicleDetails.year].filter(Boolean).join(' ')
    lineas.push(`🚗 Vehículo: ${veh} · Placa ${p.vehicleDetails.plate}`)
  }
  lineas.push(`📅 Emitida: ${fechaCorta(p.saleDate)}`)
  if (p.startDate && p.endDate) lineas.push(`🗓️ Vigencia: ${fechaCorta(p.startDate)} – ${fechaCorta(p.endDate)}`)
  lineas.push(`✅ Estado: ${p.status}`)
  lineas.push('', 'Gestionada con Bareca Seguros.')
  return lineas.join('\n')
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <View style={est.dato}>
      <Text style={est.datoEtiqueta}>{etiqueta}</Text>
      <Text style={est.datoValor}>{valor || '—'}</Text>
    </View>
  )
}

export default function DetallePoliza() {
  const { id, cat } = useLocalSearchParams<{ id: string; cat?: string }>()
  const categoria = (cat as CategoriaPoliza) ?? 'vehicle'
  const { user } = useAuth()
  const { avisar } = useToast()
  const [bajando, setBajando] = useState(false)
  const [pdfs, setPdfs] = useState<{ poliza?: string; carnet?: string } | null>(null)
  const [cargandoPdfs, setCargandoPdfs] = useState(false)
  const [docSel, setDocSel] = useState<'poliza' | 'carnet'>('poliza')
  const [errorVisor, setErrorVisor] = useState(false)

  const cargar = useCallback(() => fetchPolizas(user, categoria), [user, categoria])
  const { datos, cargando, error, recargar } = useApi(cargar, [user?.loginId, categoria])

  const p: DisplayPolicy | undefined = useMemo(
    () => datos?.items.find((x) => String(x.id) === String(id)),
    [datos, id],
  )

  // Precarga las URLs de los PDF (cuadro + carnet) para la vista previa in-app.
  const orderNumber = p?.orderNumber
  useEffect(() => {
    if (!orderNumber) return
    let vivo = true
    setCargandoPdfs(true)
    setErrorVisor(false)
    policyApi
      .regenerarPdfs(orderNumber)
      .then((r) => {
        if (!vivo) return
        const d = desenvolver(r) as any
        setPdfs({ poliza: d?.poliza, carnet: d?.carnet })
      })
      .catch(() => {
        if (vivo) setErrorVisor(true)
      })
      .finally(() => {
        if (vivo) setCargandoPdfs(false)
      })
    return () => {
      vivo = false
    }
  }, [orderNumber])

  const urlDoc = docSel === 'poliza' ? pdfs?.poliza : pdfs?.carnet
  // Android no renderiza PDF en WebView → visor de Google Docs. iOS lo renderiza directo.
  const urlVisor = urlDoc
    ? Platform.OS === 'android'
      ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(urlDoc)}`
      : urlDoc
    : null

  const abrirPdf = async (tipo: 'poliza' | 'carnet') => {
    if (bajando || !p) return
    // Si ya tenemos la URL precargada, la abrimos directo.
    const yaTengo = tipo === 'poliza' ? pdfs?.poliza : pdfs?.carnet
    if (yaTengo) {
      await Linking.openURL(yaTengo)
      return
    }
    if (!p.orderNumber) {
      avisar('Esta póliza no tiene número de orden para regenerar el PDF.', 'error')
      return
    }
    setBajando(true)
    try {
      const r = await policyApi.regenerarPdfs(p.orderNumber)
      const doc = desenvolver(r) as any
      const urlPdf = tipo === 'poliza' ? doc?.poliza : doc?.carnet
      if (!urlPdf) {
        avisar('El servidor no devolvió el documento.', 'error')
        return
      }
      await Linking.openURL(urlPdf)
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    } finally {
      setBajando(false)
    }
  }

  const compartir = async () => {
    if (!p) return
    try {
      await Share.share({ message: textoCompartir(p), title: `Póliza ${p.policyNumber || ''}`.trim() })
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    }
  }

  if (cargando) {
    return (
      <Pantalla>
        <Tarjeta style={{ padding: 18 }}>
          <Skeleton w="60%" h={18} />
          <Skeleton w="40%" h={12} style={{ marginTop: 12 }} />
          <Skeleton h={120} r={12} style={{ marginTop: 18 }} />
        </Tarjeta>
        <CargandoBloque texto="Cargando expediente…" />
      </Pantalla>
    )
  }

  if (error || !p) {
    return (
      <Pantalla>
        <EstadoError mensaje={error ?? 'Póliza no encontrada.'} onReintentar={recargar} />
      </Pantalla>
    )
  }

  const cEstado = COLOR_ESTADO[p.status]
  const catTxt = p.category === 'auto' ? 'Casco' : p.category === 'funeral' ? 'Funeraria' : 'RCV'

  return (
    <Pantalla>
      <Tarjeta style={{ padding: 18 }}>
        <Text style={est.codigo}>PÓLIZA Nº {p.policyNumber || '—'}</Text>
        <Text style={est.cliente}>{p.clientName}</Text>
        <Text style={est.sub}>{p.productName}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Pildora color={cEstado} texto={p.status} />
          <Chip texto={catTxt} />
          {p.orderNumber ? <Chip texto={`Orden ${p.orderNumber.slice(0, 8)}`} /> : null}
        </View>
        <Boton texto="Compartir por WhatsApp" variante="exito" onPress={compartir} style={{ marginTop: 14 }} />
      </Tarjeta>

      <TituloSeccion>Titular</TituloSeccion>
      <Tarjeta style={{ padding: 16 }}>
        <Dato etiqueta="Cliente" valor={p.clientName} />
        <Dato etiqueta="Documento" valor={p.clientDocument} />
        <Dato etiqueta="Emitida" valor={fechaCorta(p.saleDate)} />
        {p.startDate ? <Dato etiqueta="Vigencia" valor={fechaCorta(p.startDate)} /> : null}
        {p.endDate ? <Dato etiqueta="Vencimiento" valor={fechaCorta(p.endDate)} /> : null}
      </Tarjeta>

      {p.vehicleDetails ? (
        <>
          <TituloSeccion>Vehículo</TituloSeccion>
          <Tarjeta style={{ padding: 16 }}>
            <Dato etiqueta="Placa" valor={p.vehicleDetails.plate} />
            <Dato etiqueta="Marca / Modelo" valor={`${p.vehicleDetails.make} ${p.vehicleDetails.model}`.trim()} />
            <Dato etiqueta="Año" valor={p.vehicleDetails.year} />
            <Dato etiqueta="Serial NIV" valor={p.vehicleDetails.serialNIV} />
            <Dato etiqueta="Uso" valor={p.vehicleDetails.vehicleUse} />
          </Tarjeta>
        </>
      ) : null}

      {p.financials && (p.financials.totalPremium > 0 || p.financials.planTotal > 0) ? (
        <>
          <TituloSeccion>Financiero</TituloSeccion>
          <Tarjeta style={{ padding: 16 }}>
            {p.financials.totalPremium > 0 ? (
              <Dato etiqueta="Prima total" valor={moneda(p.financials.totalPremium, p.financials.currency === 'USD' ? '$' : 'Bs.')} />
            ) : null}
            {p.financials.planTotal > 0 ? (
              <Dato etiqueta={categoria === 'auto' ? 'Suma asegurada' : 'Monto del plan'} valor={moneda(p.financials.planTotal, p.financials.currency === 'USD' ? '$' : 'Bs.')} />
            ) : null}
            {p.financials.referenceNumber ? <Dato etiqueta="Referencia de pago" valor={p.financials.referenceNumber} /> : null}
          </Tarjeta>
        </>
      ) : null}

      <TituloSeccion>Documentos</TituloSeccion>
      <Tarjeta style={{ padding: 14, gap: 12 }}>
        {/* Selector Cuadro / Carnet */}
        <View style={est.segmento}>
          {([['poliza', 'Cuadro de póliza'], ['carnet', 'Carnet']] as const).map(([v, t]) => (
            <Pressable
              key={v}
              onPress={() => {
                setDocSel(v)
                setErrorVisor(false)
              }}
              style={[est.segItem, docSel === v && est.segItemOn]}
            >
              <Text style={[est.segTxt, docSel === v && est.segTxtOn]}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {/* Vista previa del PDF */}
        <View style={est.visor}>
          {cargandoPdfs ? (
            <View style={est.visorCentro}>
              <ActivityIndicator color={color.primary} />
              <Text style={est.visorMsg}>Generando vista previa…</Text>
            </View>
          ) : !p.orderNumber ? (
            <View style={est.visorCentro}>
              <Text style={est.visorMsg}>Esta póliza no tiene documento asociado.</Text>
            </View>
          ) : errorVisor || !urlVisor ? (
            <View style={est.visorCentro}>
              <Text style={est.visorMsg}>No se pudo cargar la vista previa. Usa “Abrir / Descargar” para verlo.</Text>
            </View>
          ) : (
            <WebView
              key={urlVisor}
              source={{ uri: urlVisor }}
              style={{ flex: 1, backgroundColor: '#fff' }}
              startInLoadingState
              renderLoading={() => (
                <View style={est.visorCentro}>
                  <ActivityIndicator color={color.primary} />
                </View>
              )}
              onError={() => setErrorVisor(true)}
              onHttpError={() => setErrorVisor(true)}
            />
          )}
        </View>

        <Boton
          texto={bajando ? 'Abriendo…' : `Abrir / Descargar ${docSel === 'poliza' ? 'cuadro' : 'carnet'}`}
          variante="primary"
          onPress={() => abrirPdf(docSel)}
          cargando={bajando}
        />
        <Text style={est.nota}>Los documentos se regeneran en el servidor. “Abrir / Descargar” los guarda en tu teléfono.</Text>
      </Tarjeta>
    </Pantalla>
  )
}

const est = StyleSheet.create({
  codigo: { fontSize: 11, fontWeight: '700', color: color.primary, letterSpacing: 0.5, fontFamily: fuenteMono },
  cliente: { fontSize: 19, fontWeight: '800', color: color.text, marginTop: 4, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: color.text2, marginTop: 2 },
  dato: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: color.borderSoft, gap: 12 },
  datoEtiqueta: { fontSize: 12, color: color.text3 },
  datoValor: { fontSize: 12.5, fontWeight: '600', color: color.text, flexShrink: 1, textAlign: 'right' },
  segmento: { flexDirection: 'row', backgroundColor: color.bgCard, borderRadius: 10, padding: 3, gap: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segItemOn: { backgroundColor: color.white, borderWidth: 1, borderColor: color.borderSoft },
  segTxt: { fontSize: 12.5, fontWeight: '700', color: color.text3 },
  segTxtOn: { color: color.primaryDark },
  visor: {
    height: 460,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: '#fff',
  },
  visorCentro: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  visorMsg: { fontSize: 12.5, color: color.text3, textAlign: 'center', lineHeight: 18 },
  nota: { fontSize: 11, color: color.text4, lineHeight: 15 },
})
