# AppVendedores (App Bareca — vendedores)

@../contexto-bareca/CONTEXTO-BARECA.md

> Requisito del import: el repo `contexto-bareca` debe estar clonado como **hermano** de esta app
> (misma carpeta padre, p.ej. `~/Plaza/Seguro/`), para que `../contexto-bareca/...` resuelva.

## Qué es esta app

- **App móvil para vendedores** (Kiosco / Distribuidor / Oficina Regional / Bareca).
- **Flujo AUTENTICADO** (login vía BFF, §5 del contexto). Réplica del portal web `policy-market`
  (`asesores.barecaonline.com`): venta RCV (normal/express) y Casco, Mis Ventas, comisiones,
  reportes, equipo, rachas, notificaciones, soporte/chat.
- **Consume el BFF**, nunca los backends Java directo (§3 y §8 del contexto).

## Stack

- **React Native + Expo (SDK 54, TypeScript), expo-router.** Solo módulos incluidos en Expo Go
  (SecureStore, react-native-webview, react-native-svg, react-native-maps) → QA sin development build.

## Backend (BFF)

- Base URL en `.env` (no hardcodear): QA `https://qaasesores.barecaonline.com`, PROD `https://asesores.barecaonline.com`.
- **Bases reales por microservicio** (verificadas contra QA): `/api/auth`, `/api/policies`
  (pólizas, casco, comisiones), `/api/payments` (info-orden, regenerate-pdfs), `/api/clients`
  (funerarias), `/api/reporte`, `/api/notifications`, `/api/public` (verificación por QR).
- **Login:** `validar-logins` → `generaToken` (JWT en cookie HttpOnly) → `validar-token` → enriquecimiento.
  Captcha **Cloudflare Turnstile** (sitekey `0x4AAAAAACd-1uO91ziroUoi`) resuelto en WebView.
- **Notificaciones:** `GET /api/notifications/mine?perfil=<ROL>&destinoId=<ID>`.

## Cómo se reconstruyó

El portal QA publica los **sourcemaps** (`.js.map` con `sourcesContent`), así que el contrato exacto
(rutas, DTOs, flujo de auth, mapeo DisplayPolicy) se reconstruyó del código Angular original. Si se
necesita re-derivar algo, descargar `https://qaasesores.barecaonline.com/<chunk>.js.map`.

## Pendiente (necesita credenciales de QA)

- Verificar login/venta extremo a extremo (usuario vendedor de QA + que el BFF acepte `x-app-name`/captcha del app).
- Completar Nueva Venta (emisión), Equipo, Mapa, Soporte/Chat, Ajuste de Pagos, Solicitudes con datos reales.

## Reglas

- No commitear secretos ni `.env` real con credenciales (el `.gitignore` bloquea `.env*.local`).
  La `.env` versionada solo trae URLs QA y el sitekey público del captcha.
- Dinero real solo en PROD; la app no dispara pagos/transferencias reales sin confirmación explícita.
