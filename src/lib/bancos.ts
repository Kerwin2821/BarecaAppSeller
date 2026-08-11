/**
 * Registro local de bancos de Venezuela por código SUDEBAN (dato público). A cada
 * banco se le asocia una insignia propia (color + siglas) para mostrarla junto al
 * nombre sin depender de red ni de los logotipos oficiales (marcas registradas).
 * Si en el futuro se dispone de los PNG oficiales con derecho de uso, se pueden
 * mapear por código en un `LogoBanco` que priorice la imagen.
 */
export interface BancoInfo {
  codigo: string
  nombre: string
  sigla: string
  color: string
}

const REGISTRO: Record<string, { nombre: string; sigla: string; color: string }> = {
  '0102': { nombre: 'Banco de Venezuela', sigla: 'BDV', color: '#C8102E' },
  '0104': { nombre: 'Venezolano de Crédito', sigla: 'BVC', color: '#0B3D91' },
  '0105': { nombre: 'Mercantil', sigla: 'MER', color: '#D6001C' },
  '0108': { nombre: 'BBVA Provincial', sigla: 'PROV', color: '#072146' },
  '0114': { nombre: 'Bancaribe', sigla: 'BCB', color: '#0099D8' },
  '0115': { nombre: 'Banco Exterior', sigla: 'EXT', color: '#003087' },
  '0128': { nombre: 'Banco Caroní', sigla: 'CAR', color: '#E37222' },
  '0134': { nombre: 'Banesco', sigla: 'BAN', color: '#00843D' },
  '0137': { nombre: 'Sofitasa', sigla: 'SOF', color: '#7A1F2B' },
  '0138': { nombre: 'Banco Plaza', sigla: 'PLZ', color: '#00539B' },
  '0146': { nombre: 'Bangente', sigla: 'BGT', color: '#E30613' },
  '0151': { nombre: 'BFC Banco Fondo Común', sigla: 'BFC', color: '#F58220' },
  '0156': { nombre: '100% Banco', sigla: '100', color: '#ED1C24' },
  '0157': { nombre: 'DelSur', sigla: 'DSR', color: '#00539B' },
  '0163': { nombre: 'Banco del Tesoro', sigla: 'TES', color: '#0C4DA2' },
  '0166': { nombre: 'Banco Agrícola de Venezuela', sigla: 'AGR', color: '#007A33' },
  '0168': { nombre: 'Bancrecer', sigla: 'BCR', color: '#E4002B' },
  '0169': { nombre: 'Mi Banco', sigla: 'MIB', color: '#00A94F' },
  '0171': { nombre: 'Banco Activo', sigla: 'ACT', color: '#ED1C24' },
  '0172': { nombre: 'Bancamiga', sigla: 'MIG', color: '#00AEEF' },
  '0173': { nombre: 'Banco Internacional de Desarrollo', sigla: 'BID', color: '#1B3A6B' },
  '0174': { nombre: 'Banplus', sigla: 'BPL', color: '#6CBE45' },
  '0175': { nombre: 'Banco Bicentenario', sigla: 'BIC', color: '#0055A4' },
  '0177': { nombre: 'BANFANB', sigla: 'FAN', color: '#4B5320' },
  '0178': { nombre: 'N58 Banco Digital', sigla: 'N58', color: '#111827' },
  '0191': { nombre: 'Banco Nacional de Crédito (BNC)', sigla: 'BNC', color: '#D6001C' },
  '0601': { nombre: 'Instituto Municipal de Crédito Popular', sigla: 'IMC', color: '#374151' },
}

/** Lista completa de bancos (para selectores locales), ordenada por nombre. */
export const BANCOS_VE: BancoInfo[] = Object.entries(REGISTRO)
  .map(([codigo, b]) => ({ codigo, ...b }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre))

/** Siglas por defecto a partir de un nombre, cuando el banco no está en el registro. */
function siglaDe(nombre: string): string {
  const palabras = (nombre || '').replace(/banco/gi, '').trim().split(/\s+/).filter(Boolean)
  const s = palabras.slice(0, 3).map((p) => p[0]).join('')
  return (s || nombre.slice(0, 3) || '$').toUpperCase()
}

const COLORES_DEFECTO = ['#0F766E', '#7C3AED', '#B45309', '#1D4ED8', '#BE123C', '#15803D']
function colorDe(codigo: string): string {
  const n = codigo.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return COLORES_DEFECTO[n % COLORES_DEFECTO.length]
}

/** Devuelve la info de un banco por código, con respaldo por nombre para bancos no listados. */
export function bancoInfo(codigo?: string | null, nombreFallback?: string | null): BancoInfo {
  const cod = String(codigo ?? '').padStart(4, '0')
  const r = REGISTRO[cod]
  if (r) return { codigo: cod, ...r }
  const nombre = nombreFallback || `Banco ${cod}`
  return { codigo: cod, nombre, sigla: siglaDe(nombre), color: colorDe(cod) }
}
