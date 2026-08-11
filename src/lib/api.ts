import * as SecureStore from 'expo-secure-store'
import type { ApiResponse } from './tipos'

/**
 * Cliente del BFF de Bareca (portal de vendedores). A diferencia del portal web,
 * la app no usa proxy: siempre llama al dominio completo del BFF (QA por defecto).
 *
 * Autenticación: el BFF entrega el JWT en una **cookie HttpOnly** al hacer
 * `generaToken`. React Native persiste y reenvía cookies por host de forma
 * nativa, así que las peticiones siguientes viajan autenticadas sin que el
 * cliente toque el token. El `x-app-name` identifica el flujo autenticado.
 */
export const BFF_URL: string = (
  process.env.EXPO_PUBLIC_BFF_URL ?? 'https://qaasesores.barecaonline.com'
).replace(/\/$/, '')

export const API_PREFIX = '/api'
export const API_BASE = `${BFF_URL}${API_PREFIX}`

/**
 * El portal de vendedores se identifica ante el BFF con `X-Portal-Id: VENDEDORES`
 * (igual que el authInterceptor de la web). No usa `x-app-name` — ese header es
 * del flujo PÚBLICO (policy-payments) y dispara el whitelist del BFF.
 */
export const PORTAL_ID = process.env.EXPO_PUBLIC_PORTAL_ID ?? 'VENDEDORES'

export class ApiException extends Error {
  readonly status: number
  readonly cuerpo?: unknown
  constructor(status: number, mensaje: string, cuerpo?: unknown) {
    super(mensaje)
    this.name = 'ApiException'
    this.status = status
    this.cuerpo = cuerpo
  }
}

/** Reacción global a un 401 (sesión inválida), la registra el AuthProvider. */
let alNoAutorizado: (() => void) | null = null
export function registrarNoAutorizado(fn: () => void) {
  alNoAutorizado = fn
}

/* ── Cookie de sesión (manejo manual) ─────────────────────────
 * El BFF autentica por la cookie `auth_token_v<prefix>`. El manejo automático
 * de cookies de React Native no es confiable entre peticiones, así que la
 * capturamos de la respuesta de `generaToken` y la reenviamos como cabecera
 * `Cookie` en cada petición. Se persiste para restaurar la sesión al reabrir.
 */
const K_COOKIE = 'bareca.cookieSesion'
let cookieSesion: string | null = null

/** Carga la cookie persistida al arrancar (antes de validar la sesión). */
export async function cargarCookieSesion(): Promise<void> {
  try {
    cookieSesion = await SecureStore.getItemAsync(K_COOKIE)
  } catch {
    cookieSesion = null
  }
}

export function limpiarCookieSesion(): void {
  cookieSesion = null
  void SecureStore.deleteItemAsync(K_COOKIE)
}

/** Extrae `auth_token_v...=valor` de la cabecera Set-Cookie y la guarda. */
function capturarCookie(res: Response): void {
  const sc = res.headers.get('set-cookie')
  if (!sc) return
  const m = sc.match(/auth_token[^=;,\s]*=[^;,\s]+/g)
  if (m && m.length > 0) {
    cookieSesion = m.join('; ')
    void SecureStore.setItemAsync(K_COOKIE, cookieSesion)
  }
}

function url(ruta: string): string {
  if (/^https?:\/\//i.test(ruta)) return ruta
  return `${API_BASE}/${ruta.replace(/^\//, '')}`
}

interface Opciones {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** No disparar el cierre de sesión global ante un 401 (login / recuperación). */
  sinCierre?: boolean
  /** Query params. */
  params?: Record<string, string | number | undefined | null>
}

function qs(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return ''
  const p: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      p.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    }
  }
  return p.length ? `?${p.join('&')}` : ''
}

/**
 * Petición cruda al BFF. Devuelve el JSON tal cual (no desenvuelve `data`):
 * el contrato mezcla `{data,statusCode,message}` y `{success,data}`, así que
 * cada llamada decide cómo leerlo.
 */
export async function bff<T = unknown>(ruta: string, opts: Opciones = {}): Promise<T> {
  const { method = 'GET', body, signal, sinCierre, params } = opts

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Portal-Id': PORTAL_ID,
  }
  // Reenvía manualmente la cookie de sesión capturada (RN no la persiste fiable).
  if (cookieSesion) headers['Cookie'] = cookieSesion
  const esForm = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !esForm) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(url(ruta) + qs(params), {
      method,
      headers,
      // RN ignora `credentials` pero persiste cookies por host de forma nativa.
      credentials: 'include',
      body:
        body === undefined ? undefined : esForm ? (body as FormData) : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new ApiException(0, 'No se pudo conectar con el servidor. Verifique su conexión.')
  }

  // Captura la cookie de sesión que setea el BFF (generaToken, etc.).
  capturarCookie(res)

  if (res.status === 401 && !sinCierre) {
    if (alNoAutorizado) alNoAutorizado()
    throw new ApiException(401, 'Su sesión expiró. Vuelva a iniciar sesión.')
  }

  if (res.status === 204) return undefined as T

  const texto = await res.text()
  let datos: unknown = null
  if (texto) {
    try {
      datos = JSON.parse(texto)
    } catch {
      datos = null
    }
  }

  if (!res.ok) {
    const e = datos as any
    // El backend (JHipster) devuelve el motivo en message / error / detail / title
    // o en fieldErrors[]; leemos todos para mostrar la causa real y no un genérico.
    const fieldErrs =
      Array.isArray(e?.fieldErrors) && e.fieldErrors.length
        ? e.fieldErrors.map((f: any) => `${f.field ?? f.objectName ?? 'campo'}: ${f.message ?? f.code ?? 'inválido'}`).join(', ')
        : null
    const msg =
      e?.message ?? e?.error ?? e?.detail ?? e?.title ?? fieldErrs ?? `El servidor respondió ${res.status}.`
    throw new ApiException(res.status, msg, datos)
  }

  return datos as T
}

/** Desenvuelve el `data` del envoltorio del BFF (soporta ambas formas). */
export function desenvolver<T>(r: ApiResponse<T> | T): T {
  if (r && typeof r === 'object' && 'data' in (r as object)) {
    return (r as ApiResponse<T>).data
  }
  return r as T
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof ApiException) return e.message
  if (e instanceof Error) return e.message
  return 'Ocurrió un error inesperado.'
}

/** URL absoluta de un recurso del BFF (para abrir PDFs, imágenes, etc.). */
export function urlBff(ruta: string): string {
  return url(ruta)
}
