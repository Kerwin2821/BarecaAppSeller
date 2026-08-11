/**
 * Exportación y compartir de reportes (PDF / Excel / CSV), equivalente a los
 * botones "Excel" y "PDF" del portal web (que usan xlsx-js-style + jsPDF).
 *
 * En el app: el Excel se genera con SheetJS a un .xlsx real; el PDF se renderiza
 * con `expo-print` (HTML → PDF) y ambos se comparten con `expo-sharing` (hoja de
 * compartir del sistema → WhatsApp, Drive, Gmail, guardar en Archivos, etc.).
 */
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import * as XLSX from 'xlsx'

export type Celda = string | number | null | undefined
export type Fila = Celda[]

const CACHE = FileSystem.cacheDirectory ?? ''

/** Limpia un nombre de archivo (sin extensión). */
function limpiarNombre(nombre: string): string {
  return (nombre || 'reporte').replace(/[^\w.-]+/g, '_').slice(0, 80)
}

async function compartir(uri: string, mime: string, uti: string, titulo: string): Promise<void> {
  const disponible = await Sharing.isAvailableAsync()
  if (!disponible) {
    throw new Error('Compartir no está disponible en este dispositivo.')
  }
  await Sharing.shareAsync(uri, { mimeType: mime, UTI: uti, dialogTitle: titulo })
}

/** AOA (arreglo de filas) → archivo .xlsx real y abre la hoja de compartir. */
export async function compartirExcel(aoa: Fila[], nombre: string, hoja = 'Datos'): Promise<void> {
  const ws = XLSX.utils.aoa_to_sheet(aoa.map((f) => f.map((c) => (c === undefined || c === null ? '' : c))))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31))
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string
  const uri = `${CACHE}${limpiarNombre(nombre)}.xlsx`
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 })
  await compartir(
    uri,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'org.openxmlformats.spreadsheetml.sheet',
    nombre,
  )
}

function celdaCsv(v: Celda): string {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** AOA → archivo .csv (Excel / Google Sheets lo abren) y comparte. */
export async function compartirCSV(aoa: Fila[], nombre: string): Promise<void> {
  const csv = aoa.map((fila) => fila.map(celdaCsv).join(',')).join('\n')
  const uri = `${CACHE}${limpiarNombre(nombre)}.csv`
  // BOM para que Excel respete acentos/UTF-8.
  await FileSystem.writeAsStringAsync(uri, `﻿${csv}`, { encoding: FileSystem.EncodingType.UTF8 })
  await compartir(uri, 'text/csv', 'public.comma-separated-values-text', nombre)
}

/** HTML → PDF (expo-print) con nombre legible y comparte. */
export async function compartirPDF(html: string, nombre: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html })
  const destino = `${CACHE}${limpiarNombre(nombre)}.pdf`
  try {
    await FileSystem.deleteAsync(destino, { idempotent: true })
    await FileSystem.moveAsync({ from: uri, to: destino })
    await compartir(destino, 'application/pdf', 'com.adobe.pdf', nombre)
  } catch {
    // Si el rename falla, comparte el archivo original de expo-print.
    await compartir(uri, 'application/pdf', 'com.adobe.pdf', nombre)
  }
}

function esc(v: Celda): string {
  const s = v === undefined || v === null ? '' : String(v)
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

/**
 * Construye el HTML de un reporte tabular con el estilo del portal (título azul
 * + meta + tabla con filas alternas). Se pasa a `compartirPDF`.
 */
export function htmlReporte(opts: {
  titulo: string
  subtitulo?: string
  meta?: string
  headers: string[]
  filas: Fila[]
  numericas?: number[]
}): string {
  const { titulo, subtitulo, meta, headers, filas, numericas = [] } = opts
  const th = headers
    .map(
      (h, i) =>
        `<th style="background:#1976D2;color:#fff;padding:7px 9px;font-size:10px;text-align:${
          numericas.includes(i) ? 'right' : 'left'
        };border:1px solid #1565C0;">${esc(h)}</th>`,
    )
    .join('')
  const body = filas
    .map(
      (f, r) =>
        `<tr style="background:${r % 2 ? '#f4f8fd' : '#ffffff'};">${headers
          .map(
            (_, i) =>
              `<td style="padding:6px 9px;font-size:10px;border:1px solid #e2e8f0;text-align:${
                numericas.includes(i) ? 'right' : 'left'
              };color:#0f2a3b;">${esc(f[i])}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"/>
    <style>*{font-family:-apple-system,Roboto,'Helvetica Neue',Arial,sans-serif;}
    body{margin:22px;color:#0f2a3b;}h1{font-size:17px;margin:0 0 2px;}
    .sub{font-size:11px;color:#475569;margin:0 0 2px;}
    .meta{font-size:10px;color:#64748b;margin:0 0 12px;}
    table{border-collapse:collapse;width:100%;}</style></head>
    <body>
      <h1>${esc(titulo)}</h1>
      ${subtitulo ? `<p class="sub">${esc(subtitulo)}</p>` : ''}
      ${meta ? `<p class="meta">${esc(meta)}</p>` : ''}
      <table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>
    </body></html>`
}
