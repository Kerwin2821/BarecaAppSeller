/**
 * Chat de soporte en tiempo real — mismo backend que la web: Firebase Firestore
 * (colección `chats/ticket_<id>/messages`, doc `{ from, fromNombre, text, ts }`,
 * Auth anónima). Para no depender del SDK de Firebase (y que corra en Expo Go
 * sin build nativo), hablamos con la **API REST de Firestore** vía fetch y
 * sondeamos los mensajes. La config web de Firebase es pública (protegida por
 * las reglas de seguridad de Firestore), igual que en el portal.
 */

const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyBuJ3rpH5uU5BJm_LwM-B09MxJco_jS5M0'
const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'bareca-d9254'
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

export interface MensajeChat {
  id: string
  from: string
  fromNombre: string
  text: string
  ts: number // epoch ms (para ordenar/mostrar)
}

let idTokenCache: { token: string; exp: number } | null = null

/** Inicia sesión anónima (REST) y cachea el idToken ~50 min. */
async function idToken(): Promise<string> {
  const ahora = Date.now()
  if (idTokenCache && idTokenCache.exp > ahora) return idTokenCache.token
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  })
  if (!res.ok) throw new Error('No se pudo iniciar el chat (auth).')
  const j = await res.json()
  idTokenCache = { token: j.idToken, exp: ahora + 50 * 60 * 1000 }
  return j.idToken
}

/** Convierte un valor tipado de Firestore a JS. */
function leerValor(v: any): any {
  if (!v) return undefined
  if (v.stringValue !== undefined) return v.stringValue
  if (v.integerValue !== undefined) return Number(v.integerValue)
  if (v.doubleValue !== undefined) return v.doubleValue
  if (v.booleanValue !== undefined) return v.booleanValue
  if (v.timestampValue !== undefined) return v.timestampValue
  if (v.nullValue !== undefined) return null
  return undefined
}

function tsAMs(ts: any, fallbackIso?: string): number {
  const raw = ts ?? fallbackIso
  if (!raw) return 0
  const n = Date.parse(raw)
  return Number.isNaN(n) ? 0 : n
}

/** Lee los mensajes de una conversación (ordenados por ts asc). */
export async function leerMensajes(convId: string): Promise<MensajeChat[]> {
  const token = await idToken()
  const url = `${FS_BASE}/chats/${encodeURIComponent(convId)}/messages?orderBy=ts&pageSize=300`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404) return [] // conversación aún sin mensajes
  if (!res.ok) throw new Error('No se pudieron cargar los mensajes.')
  const j = await res.json()
  const docs: any[] = j.documents ?? []
  return docs
    .map((d) => {
      const f = d.fields ?? {}
      return {
        id: String(d.name ?? '').split('/').pop() ?? '',
        from: leerValor(f.from) ?? '',
        fromNombre: leerValor(f.fromNombre) ?? '',
        text: leerValor(f.text) ?? '',
        ts: tsAMs(leerValor(f.ts), d.createTime),
      } as MensajeChat
    })
    .sort((a, b) => a.ts - b.ts)
}

/** Envía un mensaje a la conversación. */
export async function enviarMensaje(convId: string, from: string, fromNombre: string, text: string): Promise<void> {
  const token = await idToken()
  const url = `${FS_BASE}/chats/${encodeURIComponent(convId)}/messages`
  const body = {
    fields: {
      from: { stringValue: from },
      fromNombre: { stringValue: fromNombre },
      text: { stringValue: text },
      ts: { timestampValue: new Date().toISOString() },
    },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('No se pudo enviar el mensaje.')
}
