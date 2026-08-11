import { useCallback, useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useAuth } from '@/lib/auth'
import { reportApi } from '@/lib/endpoints'
import { mensajeDeError } from '@/lib/api'
import { actorUuid, etiquetaRol } from '@/lib/roles'
import { fechaCorta, fechaHora, isoDia, moneda, numero } from '@/lib/formato'
import { compartirExcel, compartirPDF, htmlReporte, type Celda } from '@/lib/exportar'
import type { UserRole } from '@/lib/tipos'
import { Pantalla, CabeceraPantalla } from '@/components/Pantalla'
import { CargandoBloque, EstadoError, EstadoVacio, Skeleton } from '@/components/Estados'
import { Boton, Campo, Tarjeta } from '@/components/Ui'
import { Dropdown, type OpcionDrop } from '@/components/Dropdown'
import { useToast } from '@/components/Toast'
import { color } from '@/lib/tema'

/* ── Cadena de jerarquía (para KPIs/comisiones por nivel, como la web) ── */
const CADENA: UserRole[] = ['BARECA', 'OFICINA_REGIONAL', 'DISTRIBUIDOR', 'KIOSCO']
const NIVEL_CAMPO: Record<string, string> = {
  BARECA: 'comisionBareca',
  OFICINA_REGIONAL: 'comisionOficina',
  DISTRIBUIDOR: 'comisionDistribuidor',
  KIOSCO: 'comisionKiosco',
}
const NIVEL_LABEL: Record<string, string> = {
  BARECA: 'Bareca',
  OFICINA_REGIONAL: 'Oficina',
  DISTRIBUIDOR: 'Distribuidor',
  KIOSCO: 'Kiosco',
}
const NIVEL_PLURAL: Record<string, string> = {
  OFICINA_REGIONAL: 'Oficinas',
  DISTRIBUIDOR: 'Distribuidores',
  KIOSCO: 'Kioscos',
}
const RANKING_KEY: Record<string, 'oficinas' | 'distribuidores' | 'kioscos'> = {
  OFICINA_REGIONAL: 'oficinas',
  DISTRIBUIDOR: 'distribuidores',
  KIOSCO: 'kioscos',
}

type Filtros = {
  nombre: string
  numeroPoliza: string
  cedula: string
  placa: string
  apov: string
  grua: string
  proveedorId: string
  productoId: string
  oficinaId: string
  distribuidorId: string
  kioscoId: string
  fechaDesde: string
  fechaHasta: string
  canal: string
}
const FILTROS0: Filtros = {
  nombre: '',
  numeroPoliza: '',
  cedula: '',
  placa: '',
  apov: '',
  grua: '',
  proveedorId: '',
  productoId: '',
  oficinaId: '',
  distribuidorId: '',
  kioscoId: '',
  fechaDesde: '',
  fechaHasta: '',
  canal: 'Portal de vendedor',
}
const SI_NO: OpcionDrop[] = [
  { valor: '', texto: 'Todos' },
  { valor: '1', texto: 'Sí' },
  { valor: '0', texto: 'No' },
]
const TAM_PAGINA = 25

/** Quita valores vacíos para no mandar `campo=` al BFF (igual que toParams web). */
function limpios(f: Filtros): Record<string, string | number> {
  const o: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== '') o[k] = v
  return o
}

export default function Reporte() {
  const { user } = useAuth()
  const { avisar } = useToast()
  const perfil = user?.role ?? ''
  const id = user ? (actorUuid(user) ?? '') : ''

  const niveles = useMemo(() => {
    const i = CADENA.indexOf(perfil as UserRole)
    return i < 0 ? [] : CADENA.slice(i)
  }, [perfil])
  const descendientes = niveles.slice(1)

  const [filtros, setFiltros] = useState<Filtros>(FILTROS0)
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros((f) => ({ ...f, [k]: v }))
  const [panelAbierto, setPanelAbierto] = useState(false)

  const [kpis, setKpis] = useState<any>(null)
  const [rankings, setRankings] = useState<any>(null)
  const [filas, setFilas] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null)

  // Opciones de los combos (proveedores/productos/kioscos…), una sola vez.
  const [opciones, setOpciones] = useState<any>({})
  useEffect(() => {
    if (!perfil || !id) return
    reportApi
      .opciones(perfil, id)
      .then((r: any) => setOpciones(r?.data ?? r ?? {}))
      .catch(() => setOpciones({}))
  }, [perfil, id])

  const proveedorOpts: OpcionDrop[] = useMemo(
    () => [{ valor: '', texto: 'Todos' }, ...(opciones.proveedores ?? []).map((p: any) => ({ valor: p.id, texto: p.nombre ?? p.id }))],
    [opciones],
  )
  const productoOpts: OpcionDrop[] = useMemo(() => {
    const prods = (opciones.productos ?? []).filter(
      (p: any) => !filtros.proveedorId || p.proveedorId === filtros.proveedorId,
    )
    return [{ valor: '', texto: 'Todos' }, ...prods.map((p: any) => ({ valor: p.id, texto: p.nombre ?? p.id }))]
  }, [opciones, filtros.proveedorId])
  const kioscoOpts: OpcionDrop[] = useMemo(
    () => [{ valor: '', texto: 'Todos' }, ...(opciones.kioscos ?? []).map((k: any) => ({ valor: k.id, texto: k.nombre ?? k.id }))],
    [opciones],
  )

  const cargarPolizas = useCallback(
    async (p: number, f: Filtros) => {
      const r: any = await reportApi.polizas(perfil, id, { ...limpios(f), page: p, size: TAM_PAGINA })
      const pg = r?.data ?? r
      const rows = Array.isArray(pg) ? pg : (pg?.data ?? [])
      const tot = Array.isArray(pg) ? rows.length : (pg?.total ?? rows.length)
      return { rows, tot }
    },
    [perfil, id],
  )

  const buscar = useCallback(
    async (f: Filtros) => {
      if (!perfil || !id) {
        setError('No se pudo determinar tu entidad para el reporte.')
        setCargando(false)
        return
      }
      setCargando(true)
      setError(null)
      try {
        const [rk, rr, rp] = await Promise.all([
          reportApi.kpis(perfil, id, limpios(f)),
          reportApi.rankings(perfil, id, limpios(f)).catch(() => null),
          cargarPolizas(0, f),
        ])
        setKpis((rk as any)?.data ?? rk)
        setRankings(rr ? ((rr as any)?.data ?? rr) : null)
        setFilas(rp.rows)
        setTotal(rp.tot)
        setPagina(0)
      } catch (e) {
        setError(mensajeDeError(e))
      } finally {
        setCargando(false)
      }
    },
    [perfil, id, cargarPolizas],
  )

  useEffect(() => {
    if (perfil && id) buscar(filtros)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, id])

  const irPagina = async (p: number) => {
    if (p < 0 || p * TAM_PAGINA >= total) return
    setCargando(true)
    try {
      const rp = await cargarPolizas(p, filtros)
      setFilas(rp.rows)
      setTotal(rp.tot)
      setPagina(p)
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    } finally {
      setCargando(false)
    }
  }

  const limpiar = () => {
    setFiltros(FILTROS0)
    buscar(FILTROS0)
  }

  /* ── Exportar (trae TODO el set con size grande, como fetchAll web) ── */
  const columnas: { h: string; get: (r: any) => Celda; num?: boolean }[] = useMemo(() => {
    const base: { h: string; get: (r: any) => Celda; num?: boolean }[] = [
      { h: 'Fecha', get: (r) => (r.fecha ? fechaCorta(r.fecha) : '') },
      { h: 'N° Póliza', get: (r) => r.numeroPoliza ?? '' },
      { h: 'Proveedor', get: (r) => r.proveedor ?? '' },
      { h: 'Producto', get: (r) => r.producto ?? '' },
      { h: 'Estado', get: (r) => r.estado ?? '' },
      { h: 'Vendedor', get: (r) => r.vendedor ?? '' },
      { h: 'Vig. Desde', get: (r) => (r.vigenciaDesde ? fechaCorta(r.vigenciaDesde) : '') },
      { h: 'Vig. Hasta', get: (r) => (r.vigenciaHasta ? fechaCorta(r.vigenciaHasta) : '') },
      { h: 'Tomador', get: (r) => r.tomador ?? '' },
      { h: 'Cédula', get: (r) => r.cedulaTomador ?? '' },
      { h: 'Teléfono', get: (r) => r.telefonoTomador ?? '' },
      { h: 'Correo', get: (r) => r.correoTomador ?? '' },
      { h: 'Placa', get: (r) => r.placa ?? '' },
      { h: 'Vehículo', get: (r) => [r.marca, r.modelo].filter(Boolean).join(' ') },
      { h: 'Monto USD', get: (r) => (r.montoUsd ?? '') as Celda, num: true },
      { h: 'Monto Bs', get: (r) => (r.montoBs ?? '') as Celda, num: true },
      { h: 'APOV', get: (r) => (r.tieneApov ? 'Sí' : 'No') },
      { h: 'Grúa', get: (r) => (r.tieneGrua ? 'Sí' : 'No') },
    ]
    for (const lvl of niveles) {
      base.push({ h: `Com. ${NIVEL_LABEL[lvl]}`, get: (r) => (r[NIVEL_CAMPO[lvl]] ?? '') as Celda, num: true })
    }
    return base
  }, [niveles])

  const traerTodas = useCallback(async () => {
    const todas: any[] = []
    let p = 0
    const size = 500
    for (;;) {
      const r: any = await reportApi.polizas(perfil, id, { ...limpios(filtros), page: p, size })
      const pg = r?.data ?? r
      const rows = Array.isArray(pg) ? pg : (pg?.data ?? [])
      todas.push(...rows)
      const tot = Array.isArray(pg) ? rows.length : (pg?.total ?? todas.length)
      if (rows.length < size || todas.length >= tot || p > 40) break
      p++
    }
    return todas
  }, [perfil, id, filtros])

  const exportar = async (tipo: 'excel' | 'pdf') => {
    if (exportando) return
    setExportando(tipo)
    try {
      const todas = await traerTodas()
      if (todas.length === 0) {
        avisar('No hay pólizas para exportar con esos filtros.', 'info')
        return
      }
      const headers = columnas.map((c) => c.h)
      const numericas = columnas.map((c, i) => (c.num ? i : -1)).filter((i) => i >= 0)
      const cuerpo = todas.map((row) => columnas.map((c) => c.get(row)))
      const nombre = `reporte-polizas-${isoDia(new Date())}`
      const titulo = 'Reporte de Pólizas Vendidas'
      const sub = `${etiquetaRol(perfil as UserRole)} · ${user?.firstName ?? ''}`.trim()
      const meta = `Generado: ${fechaHora(new Date())}  ·  Total: ${todas.length} pólizas`
      if (tipo === 'excel') {
        await compartirExcel([[titulo], [sub], [meta], headers, ...cuerpo], nombre, 'Pólizas')
      } else {
        await compartirPDF(htmlReporte({ titulo, subtitulo: sub, meta, headers, filas: cuerpo, numericas }), nombre)
      }
    } catch (e) {
      avisar(mensajeDeError(e), 'error')
    } finally {
      setExportando(null)
    }
  }

  const filtrosActivos = useMemo(
    () => Object.entries(limpios(filtros)).filter(([k]) => k !== 'canal').length,
    [filtros],
  )
  const desde = pagina * TAM_PAGINA + 1
  const hasta = Math.min((pagina + 1) * TAM_PAGINA, total)

  return (
    <Pantalla onRefresh={() => buscar(filtros)}>
      <CabeceraPantalla titulo="Reporte de Pólizas Vendidas" detalle="KPIs, filtros y descarga en Excel / PDF" />

      {/* KPIs */}
      {cargando && !kpis ? (
        <View style={est.kpiGrid}>
          {[0, 1, 2, 3].map((i) => (
            <Tarjeta key={i} style={est.kpi}>
              <Skeleton w="60%" h={10} />
              <Skeleton w="80%" h={18} style={{ marginTop: 10 }} />
            </Tarjeta>
          ))}
        </View>
      ) : error && !kpis ? (
        <EstadoError mensaje={error} onReintentar={() => buscar(filtros)} />
      ) : (
        <View style={est.kpiGrid}>
          <KpiCard etiqueta="TOTAL PÓLIZAS" valor={numero(kpis?.totalPolizas ?? 0)} c={color.primary} />
          <KpiCard etiqueta="MONTO TOTAL" valor={moneda(kpis?.montoTotal ?? 0)} c={color.text} />
          {niveles.map((lvl, i) => (
            <KpiCard
              key={lvl}
              etiqueta={i === 0 ? 'MI COMISIÓN' : `COM. ${NIVEL_LABEL[lvl].toUpperCase()}`}
              valor={moneda(kpis?.[NIVEL_CAMPO[lvl]] ?? 0)}
              c={i === 0 ? color.success : color.text2}
            />
          ))}
        </View>
      )}

      {/* Mejores <nivel descendiente> */}
      {descendientes.map((lvl) => {
        const lista: any[] = rankings?.[RANKING_KEY[lvl]] ?? []
        if (!lista.length) return null
        const max = Math.max(...lista.map((x) => x.monto ?? 0), 1)
        return (
          <Tarjeta key={lvl} style={{ padding: 16, marginTop: 12 }}>
            <Text style={est.seccion}>Mejores {NIVEL_PLURAL[lvl]}</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {lista.slice(0, 5).map((x, i) => (
                <View key={x.id ?? i}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={est.rankNombre} numberOfLines={1}>
                      {x.nombre || '—'} <Text style={est.rankCant}>({x.cantidad ?? 0})</Text>
                    </Text>
                    <Text style={est.rankMonto}>{moneda(x.monto ?? 0)}</Text>
                  </View>
                  <View style={est.barBg}>
                    <View style={[est.barFg, { width: `${Math.max(4, ((x.monto ?? 0) / max) * 100)}%` }]} />
                  </View>
                </View>
              ))}
            </View>
          </Tarjeta>
        )
      })}

      {/* Barra de acciones: filtros + exportar */}
      <View style={est.acciones}>
        <Pressable onPress={() => setPanelAbierto((v) => !v)} style={est.btnFiltros}>
          <Text style={est.btnFiltrosTxt}>
            {panelAbierto ? '▲' : '▼'} Filtros{filtrosActivos ? ` (${filtrosActivos})` : ''}
          </Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Boton
            texto="Excel"
            variante="mini"
            cargando={exportando === 'excel'}
            onPress={() => exportar('excel')}
          />
          <Boton texto="PDF" variante="mini" cargando={exportando === 'pdf'} onPress={() => exportar('pdf')} />
        </View>
      </View>

      {/* Panel de filtros */}
      {panelAbierto ? (
        <Tarjeta style={{ padding: 14, marginBottom: 12, gap: 12 }}>
          <Campo etiqueta="Nombre" placeholder="Tomador…" value={filtros.nombre} onChangeText={(t) => set('nombre', t)} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Campo
              etiqueta="N° Póliza"
              placeholder="0000026"
              value={filtros.numeroPoliza}
              onChangeText={(t) => set('numeroPoliza', t)}
              style={{ flex: 1 }}
            />
            <Campo
              etiqueta="Cédula"
              placeholder="V12345678"
              autoCapitalize="characters"
              value={filtros.cedula}
              onChangeText={(t) => set('cedula', t)}
              style={{ flex: 1 }}
            />
          </View>
          <Campo
            etiqueta="Placa"
            placeholder="AB123CD"
            autoCapitalize="characters"
            value={filtros.placa}
            onChangeText={(t) => set('placa', t)}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Dropdown etiqueta="APOV" opciones={SI_NO} valor={filtros.apov} onCambiar={(v) => set('apov', v)} />
            </View>
            <View style={{ flex: 1 }}>
              <Dropdown etiqueta="Grúa" opciones={SI_NO} valor={filtros.grua} onCambiar={(v) => set('grua', v)} />
            </View>
          </View>
          <Dropdown
            etiqueta="Proveedor"
            opciones={proveedorOpts}
            valor={filtros.proveedorId}
            onCambiar={(v) => setFiltros((f) => ({ ...f, proveedorId: v, productoId: '' }))}
          />
          <Dropdown
            etiqueta="Producto"
            opciones={productoOpts}
            valor={filtros.productoId}
            onCambiar={(v) => set('productoId', v)}
          />
          {perfil !== 'KIOSCO' ? (
            <Dropdown etiqueta="Kiosco" opciones={kioscoOpts} valor={filtros.kioscoId} onCambiar={(v) => set('kioscoId', v)} />
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <CampoFecha etiqueta="Desde" valor={filtros.fechaDesde} onCambiar={(v) => set('fechaDesde', v)} />
            <CampoFecha etiqueta="Hasta" valor={filtros.fechaHasta} onCambiar={(v) => set('fechaHasta', v)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
            <Boton texto="Limpiar" variante="soft" onPress={limpiar} style={{ flex: 1 }} />
            <Boton texto="Buscar" onPress={() => buscar(filtros)} style={{ flex: 1.4 }} />
          </View>
        </Tarjeta>
      ) : null}

      {/* Tabla / lista de pólizas */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={est.seccion}>Pólizas {total ? `(${total})` : ''}</Text>
        {total > TAM_PAGINA ? (
          <Text style={est.paginaInfo}>
            {desde}–{hasta} de {total}
          </Text>
        ) : null}
      </View>

      {cargando ? (
        <CargandoBloque texto="Cargando pólizas…" />
      ) : filas.length === 0 ? (
        <Tarjeta>
          <EstadoVacio titulo="Sin resultados" detalle="No hay pólizas con los filtros seleccionados." />
        </Tarjeta>
      ) : (
        <View style={{ gap: 8 }}>
          {filas.map((r, i) => (
            <PolizaFila key={r.numeroPoliza ?? i} r={r} />
          ))}
          {total > TAM_PAGINA ? (
            <View style={est.pager}>
              <Boton texto="‹ Anterior" variante="mini" disabled={pagina === 0} onPress={() => irPagina(pagina - 1)} />
              <Text style={est.paginaInfo}>Página {pagina + 1}</Text>
              <Boton
                texto="Siguiente ›"
                variante="mini"
                disabled={(pagina + 1) * TAM_PAGINA >= total}
                onPress={() => irPagina(pagina + 1)}
              />
            </View>
          ) : null}
        </View>
      )}
    </Pantalla>
  )
}

function KpiCard({ etiqueta, valor, c }: { etiqueta: string; valor: string; c: string }) {
  return (
    <Tarjeta style={[est.kpi, { borderTopColor: c, borderTopWidth: 3 }]}>
      <Text style={est.kpiEtiqueta}>{etiqueta}</Text>
      <Text style={[est.kpiValor, { color: c === color.text2 ? color.text : c }]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
    </Tarjeta>
  )
}

function CampoFecha({
  etiqueta,
  valor,
  onCambiar,
}: {
  etiqueta: string
  valor: string
  onCambiar: (iso: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const base = valor ? new Date(`${valor}T00:00:00`) : new Date()
  return (
    <View style={{ flex: 1 }}>
      <Text style={est.filtroLbl}>{etiqueta}</Text>
      <Pressable onPress={() => setAbierto(true)} style={est.fecha}>
        <Text style={{ fontSize: 13, color: valor ? color.text : color.text4 }}>{valor ? fechaCorta(valor) : 'dd/mm/aaaa'}</Text>
        {valor ? (
          <Pressable onPress={() => onCambiar('')} hitSlop={8}>
            <Text style={{ color: color.text3, fontSize: 13 }}>✕</Text>
          </Pressable>
        ) : null}
      </Pressable>
      {abierto ? (
        <DateTimePicker
          value={base}
          mode="date"
          onChange={(e, sel) => {
            setAbierto(false)
            if (e.type === 'set' && sel) onCambiar(isoDia(sel))
          }}
        />
      ) : null}
    </View>
  )
}

function PolizaFila({ r }: { r: any }) {
  const vigencia =
    r.vigenciaDesde && r.vigenciaHasta
      ? `${fechaCorta(r.vigenciaDesde)} – ${fechaCorta(r.vigenciaHasta)}`
      : r.vigenciaDesde
        ? fechaCorta(r.vigenciaDesde)
        : '—'
  return (
    <Tarjeta style={{ padding: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <Text style={est.polNum}>N° {r.numeroPoliza ?? '—'}</Text>
        <Text style={est.polFecha}>{r.fecha ? fechaCorta(r.fecha) : '—'}</Text>
      </View>
      <Text style={est.polLinea} numberOfLines={1}>
        {[r.proveedor, r.producto].filter(Boolean).join(' · ') || '—'}
      </Text>
      {r.vendedor ? (
        <Text style={est.polSub} numberOfLines={1}>
          Vendedor: {r.vendedor}
        </Text>
      ) : null}
      <Text style={est.polSub}>Vigencia: {vigencia}</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {r.tieneApov ? <Etiqueta t="APOV" /> : null}
        {r.tieneGrua ? <Etiqueta t="Grúa" /> : null}
        {r.placa ? <Etiqueta t={String(r.placa)} tenue /> : null}
        {r.urlPoliza ? (
          <Pressable onPress={() => Linking.openURL(r.urlPoliza)} hitSlop={6}>
            <Text style={est.pdfLink}>Ver PDF ↗</Text>
          </Pressable>
        ) : null}
      </View>
    </Tarjeta>
  )
}

function Etiqueta({ t, tenue = false }: { t: string; tenue?: boolean }) {
  return (
    <View style={[est.etq, tenue && { backgroundColor: color.bgCard, borderColor: color.borderSoft }]}>
      <Text style={[est.etqTxt, tenue && { color: color.text3 }]}>{t}</Text>
    </View>
  )
}

const est = StyleSheet.create({
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: { padding: 14, width: '47.6%', flexGrow: 1 },
  kpiEtiqueta: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3, color: color.text3 },
  kpiValor: { fontSize: 19, fontWeight: '800', marginTop: 8, letterSpacing: -0.4 },
  seccion: { fontSize: 14.5, fontWeight: '800', color: color.text },
  rankNombre: { fontSize: 12.5, fontWeight: '700', color: color.text, flex: 1, marginRight: 8 },
  rankCant: { fontSize: 11, fontWeight: '600', color: color.text3 },
  rankMonto: { fontSize: 12, fontWeight: '800', color: color.primary },
  barBg: { height: 7, borderRadius: 99, backgroundColor: color.bgCard, overflow: 'hidden' },
  barFg: { height: 7, borderRadius: 99, backgroundColor: color.primary },
  acciones: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 12 },
  btnFiltros: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.white,
  },
  btnFiltrosTxt: { fontSize: 12.5, fontWeight: '800', color: color.text2 },
  filtroLbl: { fontSize: 12, fontWeight: '700', color: color.text2, marginBottom: 6 },
  fecha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: color.borderInput,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 13,
    backgroundColor: color.white,
  },
  paginaInfo: { fontSize: 11.5, color: color.text3, fontWeight: '600' },
  pager: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  polNum: { fontSize: 14, fontWeight: '800', color: color.text },
  polFecha: { fontSize: 11.5, color: color.text3 },
  polLinea: { fontSize: 12.5, color: color.text2, marginTop: 6, fontWeight: '600' },
  polSub: { fontSize: 11.5, color: color.text3, marginTop: 3 },
  etq: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 99,
    backgroundColor: color.primaryLight,
    borderWidth: 1,
    borderColor: color.primaryLight,
  },
  etqTxt: { fontSize: 10.5, fontWeight: '800', color: color.primaryDark },
  pdfLink: { fontSize: 11.5, fontWeight: '800', color: color.primary },
})
