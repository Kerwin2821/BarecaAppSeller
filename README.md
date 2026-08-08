# AppVendedores 📱

App móvil (iOS + Android, React Native + Expo) del **portal de vendedores de Bareca**
(`asesores.barecaonline.com`). Replica el flujo de venta de seguros del portal web `policy-market`
consumiendo el **BFF** de Bareca (no los backends Java directo).

> Contexto de backend/arquitectura: [`../contexto-bareca/CONTEXTO-BARECA.md`](../contexto-bareca/CONTEXTO-BARECA.md).

## Ambiente (QA)

Configurado en [`.env`](.env):

```
EXPO_PUBLIC_BFF_URL=https://qaasesores.barecaonline.com   # BFF QA (bff-polizas-claude)
EXPO_PUBLIC_APP_NAME=policy-market                        # x-app-name (flujo autenticado)
EXPO_PUBLIC_TURNSTILE_SITEKEY=0x4AAAAAACd-1uO91ziroUoi    # captcha del login (público)
```

Para producción: `EXPO_PUBLIC_BFF_URL=https://asesores.barecaonline.com`.

## Probar en QA con el QR (ngrok)

Node 22. El teléfono **no** necesita el mismo Wi-Fi: el QR sale por túnel ngrok.

```bash
npm install
npm start          # = expo start --tunnel  →  QR
```

Instala **Expo Go**, escanea el QR (Android: desde Expo Go · iOS: cámara). La app abre contra QA.

> `npm run start:lan` usa la red local si el teléfono comparte Wi-Fi.

## Pantallas (menú por rol, igual que el sidebar web)

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Login (Turnstile) · Recuperar clave · Cambio de clave | `/login` … | ✅ Contra el BFF real |
| **Mis Ventas** (pólizas) + detalle con PDF | `/polizas` | ✅ `GET /api/policies/polizas`, PDF `/api/payments/regenerate-pdfs` |
| **Mis Comisiones** | `/comisiones` | ✅ `/api/policies/comision-transaccion-items/v1/totales` |
| **Reporte de Pólizas** | `/reporte` | ✅ `/api/reporte/kpis` |
| **Mi Perfil** | `/perfil` | ✅ Datos de sesión |
| Notificaciones (campana) | header | ✅ `/api/notifications/mine` |
| Verificación pública de póliza (QR) | `/verificar/:n` | ✅ `/api/public/documento/ver/:n` |
| **Nueva Venta** / **Venta Rápida** | `/nueva-venta(-express)` | 🟡 Estructura real de pasos; emisión requiere sesión QA |
| Equipo · Rachas · Mapa · Soporte · Chat · Ajuste de Pagos · Solicitudes | … | 🟡 Cableadas; se completan con credenciales QA |

Roles: `BARECA`, `OFICINA_REGIONAL`, `DISTRIBUIDOR`, `KIOSCO`, `EMPLEADO` (mismas reglas de visibilidad que la web).

## Autenticación

Login por el BFF (igual que el portal):
`POST /auth/logins/v1/validar-logins` → `loginId` → `POST /auth/secciones-tokens/v1/generaToken`
(deja el **JWT en cookie HttpOnly**) → `validar-token` → enriquecimiento del perfil.
El captcha **Cloudflare Turnstile** se resuelve en un WebView (`react-native-webview`).
La sesión se restaura al abrir el app validando la cookie. Cierre de sesión limpia cookie + perfil.

> **Para verificar login/venta extremo a extremo hace falta:** credenciales de un vendedor de QA
> y que el BFF QA acepte el `x-app-name`/captcha desde el app. La cookie HttpOnly la persiste RN
> de forma nativa; si el BFF exige `SameSite`/dominio estrictos, habría que ajustar en el BFF.

## Estructura

```
app/                     Rutas (expo-router)
  _layout.tsx            Providers + guardia de sesión
  login · recuperar-contrasena · cambiar-clave
  verificar/[policyNumber]         (público)
  (app)/                 Grupo autenticado (drawer + header con campana)
    index (redirige por rol) · polizas/ · comisiones · reporte · perfil ·
    nueva-venta(-express) · equipo · rachas · mapa-conexiones ·
    soporte · chat · ajuste-pagos · solicitudes-modificacion
src/
  lib/    api.ts (BFF) · endpoints.ts · auth.tsx · sesion.ts (SecureStore) ·
          tipos.ts · roles.ts · polizas.ts · formato.ts · tema.ts
  components/  Drawer · AppHeader · CaptchaTurnstile · Ui · Estados · Toast · Wizard …
```

## Verificación

```bash
npm run typecheck   # tsc --noEmit
```
