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

## 4. Pago / emisión (Nueva Venta) — endpoints que consume el app

El app replica **1:1** el flujo del portal (`PaymentStepStateService` + estrategias RCV/Funeraria).
Todas estas rutas ya existen en el BFF; solo hay que **confirmar que responden con la cookie del app**
(van autenticadas, no por el whitelist público):

**Carga inicial del paso de pago**
- `GET /api/policies/orden-seguros/v1/convertir-monedas/1/EUR/VES` y `.../1/USD/VES` (tasa BCV)
- `GET /api/policies/pre-ordende-pagos/v1/lista-bancos`
- `GET /api/payments/config` (gateways + `pagoMovilHabilitado`)
- `POST /api/policies/orden-seguros/v1/comision-prepagada` | `.../comision-descuento`

**Staging del cliente + vehículo (antes de la orden)**
- `GET /api/clients/clientes?numeroDocumento.equals=…` · `POST /api/clients/clientes/v1/add-cliente`
- `POST /api/policies/registros-vehiculos/v1/addRegisterVehicle`

**Débito Inmediato:** `vigente/{placa}` → `addorden-client` → `debito-inmediato` (OTP) →
`consultar-operacion` (polling 20×6 s) → `payments/finalize-policy`.
**Pago Móvil:** `addorden-client-pagoMovil` → `GET /api/webhook/status/{orden}` (polling 60×10 s) → finalize.
**Funerario:** `clients/ordens/v1/addorden-client(-pagoMovil)` → `clients/polizas-funerarios/v1/finalizar-poliza`.

> El app **no** implementa el socket.io de tiempo real del pago móvil; usa el **polling de respaldo**
> (`/api/webhook/status/{orden}`) que el propio BFF ya expone. Confirmar que ese endpoint está accesible
> para el app.

### Monto de prueba (QA)
El app envía `totalPagar: 1` cuando `EXPO_PUBLIC_MONTO_REAL=false` (QA), igual que `environment.montoReal`
en la web. Así el **débito inmediato** cobra **1 Bs** y se puede repetir la prueba n veces. En PROD se pondrá
`EXPO_PUBLIC_MONTO_REAL=true`.

### A verificar contra QA (mueve dinero real, 1 Bs)
- Que `add-cliente` y `addRegisterVehicle` acepten el payload del app (los construimos según
  `AddCustomerPayload`/`RegisterVehiclePayload`; confirmar nombres de campos de dirección/teléfono).
- Que `debito-inmediato` dispare el SMS del banco al teléfono afiliado (en la web el OTP lo envía el banco
  al crear/enviar el débito, no hay endpoint aparte).

## Resumen de lo que hay que pedir

1. **Turnstile:** habilitar el sitekey para el WebView del app (allowed hostnames) o dar un sitekey de app/QA.
2. **Sesión:** confirmar que la cookie actual sirve desde el app **o** (recomendado) exponer el token para
   `Authorization: Bearer` cuando la petición venga del app.
3. Un **usuario vendedor de QA** para probar login → Nueva Venta (RCV débito 1 Bs) → Mis Ventas.
4. Confirmar que los endpoints de **pago/emisión** (§4) responden al app con la cookie de sesión.
