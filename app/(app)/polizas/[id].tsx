import { useCallback, useMemo, useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { useApi } from '@/hooks/useApi'
import { fetchPolizas } from '@/lib/polizas'
import { policyApi } from '@/lib/endpoints'
import { desenvolver, mensajeDeError } from '@/lib/api'
import { fechaCorta } from '@/lib/formato'
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

function Dato({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <View style={est.dato}>
      <Text style={est.datoEtiqueta}>{etiqueta}</Text>
      <Text style={est.datoValor}>{valor || '—'}</Text>
    </View>
  )
}

export default function DetallePoliza() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { avisar } = useToast()
  const [bajando, setBajando] = useState(false)

  const cargar = useCallback(() => fetchPolizas(user), [user])
  const { datos, cargando, error, recargar } = useApi(cargar, [user?.loginId])

  const p: DisplayPolicy | undefined = useMemo(
    () => datos?.items.find((x) => String(x.id) === String(id)),
    [datos, id],
  )

  const abrirPdf = async (tipo: 'poliza' | 'carnet') => {
    if (bajando || !p) return
    if (!p.orderNumber) {
      avisar('Esta póliza no tiene número de orden para regenerar el PDF.', 'error')
      return
    }
    setBajando(true)
    try {
      const r = await policyApi.regenerarPdfs(p.orderNumber)
      const pdfs = desenvolver(r)
      const urlPdf = tipo === 'poliza' ? pdfs?.poliza : pdfs?.carnet
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

      <TituloSeccion>Documentos</TituloSeccion>
      <Tarjeta style={{ padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 12, color: color.text2, lineHeight: 18 }}>
          Cuadro de póliza y carnet en PDF (se regeneran en el servidor y se abren para compartir/guardar).
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Boton
            texto={bajando ? 'Generando…' : 'Cuadro de póliza'}
            variante="primary"
            onPress={() => abrirPdf('poliza')}
            cargando={bajando}
            style={{ flex: 1 }}
          />
          <Boton texto="Carnet" variante="soft" onPress={() => abrirPdf('carnet')} disabled={bajando} style={{ flex: 1 }} />
        </View>
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
})
