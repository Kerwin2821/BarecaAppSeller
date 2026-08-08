import { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Spinner } from './Estados'
import { color, radio } from '../lib/tema'

export interface OpcionDrop {
  valor: string
  texto: string
}

/**
 * Selector tipo dropdown con búsqueda, en un modal. Sustituto del `<select>`
 * del portal para las cascadas del catálogo (marca/modelo/versión/año).
 */
export function Dropdown({
  etiqueta,
  placeholder = 'Seleccione…',
  opciones,
  valor,
  onCambiar,
  cargando = false,
  deshabilitado = false,
}: {
  etiqueta?: string
  placeholder?: string
  opciones: OpcionDrop[]
  valor: string | null
  onCambiar: (valor: string) => void
  cargando?: boolean
  deshabilitado?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState('')

  const seleccionado = opciones.find((o) => o.valor === valor)
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return opciones
    return opciones.filter((o) => o.texto.toLowerCase().includes(q))
  }, [opciones, busca])

  return (
    <View>
      {etiqueta ? <Text style={est.etiqueta}>{etiqueta}</Text> : null}
      <Pressable
        onPress={() => {
          if (!deshabilitado && !cargando) {
            setBusca('')
            setAbierto(true)
          }
        }}
        style={[est.campo, (deshabilitado || cargando) && { backgroundColor: color.bgCard, opacity: 0.7 }]}
      >
        <Text style={[est.valor, !seleccionado && { color: color.text4 }]} numberOfLines={1}>
          {seleccionado?.texto ?? placeholder}
        </Text>
        {cargando ? <Spinner size={14} /> : <Text style={est.chevron}>▾</Text>}
      </Pressable>

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable style={est.velo} onPress={() => setAbierto(false)} />
        <View style={est.hoja}>
          <View style={est.hojaHead}>
            <Text style={est.hojaTitulo}>{etiqueta ?? 'Seleccione'}</Text>
            <Pressable onPress={() => setAbierto(false)} hitSlop={8}>
              <Text style={{ fontSize: 15, color: color.text2 }}>✕</Text>
            </Pressable>
          </View>
          <TextInput
            placeholder="Buscar…"
            placeholderTextColor={color.text4}
            value={busca}
            onChangeText={setBusca}
            autoFocus
            style={est.busca}
          />
          <FlatList
            data={filtradas}
            keyExtractor={(o) => o.valor}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 340 }}
            renderItem={({ item }) => {
              const activo = item.valor === valor
              return (
                <Pressable
                  onPress={() => {
                    onCambiar(item.valor)
                    setAbierto(false)
                  }}
                  style={({ pressed }) => [est.item, (activo || pressed) && { backgroundColor: color.primaryTint }]}
                >
                  <Text style={[est.itemTexto, activo && { color: color.primaryDark, fontWeight: '800' }]}>
                    {item.texto}
                  </Text>
                  {activo ? <Text style={{ color: color.primary }}>✓</Text> : null}
                </Pressable>
              )
            }}
            ListEmptyComponent={<Text style={est.vacio}>Sin resultados</Text>}
          />
        </View>
      </Modal>
    </View>
  )
}

const est = StyleSheet.create({
  etiqueta: { fontSize: 12, fontWeight: '700', color: color.text2, marginBottom: 6 },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: radio.md + 2,
    paddingVertical: 12,
    paddingHorizontal: 13,
    backgroundColor: color.white,
  },
  valor: { flex: 1, fontSize: 13.5, color: color.text },
  chevron: { fontSize: 12, color: color.text3 },
  velo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,42,59,0.35)' },
  hoja: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: '14%',
    backgroundColor: color.white,
    borderRadius: radio.lg,
    overflow: 'hidden',
    shadowColor: '#0B2A3B',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  hojaHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
  },
  hojaTitulo: { fontSize: 14, fontWeight: '800', color: color.text },
  busca: {
    margin: 12,
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: radio.md,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: color.text,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: color.borderSoft,
  },
  itemTexto: { fontSize: 13.5, color: color.text, flex: 1 },
  vacio: { padding: 24, textAlign: 'center', fontSize: 12.5, color: color.text3 },
})
