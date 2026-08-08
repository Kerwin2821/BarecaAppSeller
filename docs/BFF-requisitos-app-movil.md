# Requisitos del BFF para la app móvil de vendedores

Para pedir al equipo que mantiene `policy-market/mi-bff` (BFF `bff-polizas-claude` en QA).
Basado en el código real del BFF (`middleware/tokenProxy.js`, `controllers/auth.controller.js`).

## Contexto (cómo autentica hoy el BFF)

- El flujo de **vendedores** se gatea **solo por la cookie de sesión** `auth_token_v<sessionPrefix>`
  (`middleware/tokenProxy.js`): si la ruta no es pública y no llega esa cookie → `401 SESSION_EXPIRED`.
- La cookie la setea `POST /api/auth/secciones-tokens/v1/generaToken` con:
  `httpOnly: true`, `sameSite: 'Lax'`, `secure: (NODE_ENV==='production')`, **sin `domain`** (host-only),
  `maxAge: 1 día`. **`generaToken` NO devuelve el token en el body** (por diseño).
- Los headers `X-Portal-Id` / `x-app-name` **no** gatean el flujo de vendedores. `x-app-name: policy-payments`
  es solo del flujo PÚBLICO (autogestión) y además exige `x-api-key`. La app manda `X-Portal-Id: VENDEDORES`
  (igual que el `authInterceptor` de la web) y **no** debe mandar `x-app-name: policy-payments`.

La app nativa (React Native) persiste y reenvía cookies por host de forma nativa, así que en teoría la cookie
`Lax` host-only funciona. Lo que sigue es lo que hay que **confirmar o ajustar** para que funcione desde el móvil.

## 1. Captcha Turnstile desde el WebView del app  (riesgo principal del login)

`validar-logins` exige `recaptchaToken` (Cloudflare Turnstile). En el app el widget se renderiza en un WebView
apuntando al dominio QA. Cloudflare valida el **hostname** contra la lista del sitekey.

- **Pedir:** que el sitekey del portal QA (`0x4AAAAAACd-1uO91ziroUoi`) tenga en su *Allowed Hostnames*
  el hostname con el que el WebView renderiza (el dominio QA), **o** que emitan un **sitekey dedicado para el app**.
- Alternativa para QA: un sitekey de prueba *always-pass* de Cloudflare para el ambiente de pruebas del app.

## 2. Sesión para un cliente nativo (cookie vs. token)

Hoy la sesión vive en una cookie httpOnly que el BFF no expone en el body. Para un cliente móvil eso es frágil
(depende de que el store de cookies del SO reenvíe la cookie en cada request).

- **Opción A (mínima, sin cambios):** confirmar que basta la cookie actual. `SameSite=Lax` y host-only **no**
  bloquean a un cliente nativo (SameSite es un concepto de navegador). Debería funcionar tal cual; solo hay que
  **verificarlo con un usuario de QA desde el app**.
- **Opción B (robusta, recomendada para móvil):** que el BFF, cuando la petición venga del app
  (p. ej. `X-Portal-Id: VENDEDORES-APP`), **devuelva el token en el body** de `generaToken` (o un endpoint
  `/auth/.../app-token`), y que `tokenProxy` acepte además `Authorization: Bearer <token>`. Así el app no depende
  de la persistencia de cookies. Es el patrón estándar para apps nativas.

## 3. Nada que tocar en CORS ni en x-app-name

- CORS no aplica a un cliente nativo (no hay `Origin` que validar).
- No agregar la app al whitelist de `policy-payments` (ese es el flujo público). El app es **autenticado**.

## Resumen de lo que hay que pedir

1. **Turnstile:** habilitar el sitekey para el WebView del app (allowed hostnames) o dar un sitekey de app/QA.
2. **Sesión:** confirmar que la cookie actual sirve desde el app **o** (recomendado) exponer el token para
   `Authorization: Bearer` cuando la petición venga del app.
3. Un **usuario vendedor de QA** para probar login → Mis Ventas → comisiones extremo a extremo.
