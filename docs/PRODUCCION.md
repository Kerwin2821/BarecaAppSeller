# Compilar el app para PRODUCCIÓN

> ⚠️ **En producción cada emisión cobra el monto real al cliente.** En QA cobra 1 Bs.

## Estado actual

| | QA (por defecto) | Producción |
|---|---|---|
| BFF | `qaasesores.barecaonline.com` | `asesores.barecaonline.com` |
| Portal cliente | `qaportal.bareca.com` | `portal.bareca.com` |
| Monto | **1 Bs** (`MONTO_REAL=false`) | **real** (`MONTO_REAL=true`) |
| Archivo | `.env` (versionado) | `.env.production` (versionado) |
| Secretos | `.env.local` | `.env.production.local` (ignorado en git) |

**Sin `NODE_ENV=production` el app siempre compila contra QA.** Es la protección principal:
un `assembleRelease` normal nunca produce un APK que cobre dinero real.

## Pendiente antes de la primera compilación

1. **Clave del login de producción** (`APP_LOGIN_KEY` del BFF de PROD).
   Pedirla al equipo que administra el BFF y ponerla en `.env.production.local`:
   ```
   cp .env.production.local.ejemplo .env.production.local
   # editar y reemplazar PENDIENTE_PEDIR_A_BFF por la clave real
   ```
   Sin ella el login responde **401 `INVALID_APP_KEY`**.

2. **Confirmar si producción usa otro proyecto Firebase** (chat de soporte).
   Si es así, agregar `EXPO_PUBLIC_FIREBASE_API_KEY` en `.env.production.local`.

3. **Confirmar que el BFF de producción tiene habilitado el login de app**
   (la ruta `/auth/logins/v1/validar-logins-app` y su `APP_LOGIN_KEY` configurada).

4. **Billetera:** verificar si `walletHabilitado` está activo para el portal VENDEDORES en
   producción. Si no lo está, el método de pago «Billetera» no aparecerá (no es un fallo del app).

## Cómo compilar

```bash
./compilar-produccion.sh
```

El script **se niega a compilar** si:
- falta `.env.production.local` o la clave sigue con el valor de ejemplo,
- `.env.local` define `BFF_URL` / `MONTO_REAL` / `PORTAL_CLIENTE_URL`
  (en Expo `.env.local` tiene **más prioridad** que `.env.production` y dejaría el APK apuntando a QA),
- no escribes `PRODUCCION` para confirmar.

Al terminar **verifica el bundle ya compilado**: si encuentra la URL de QA dentro del APK, aborta.
El resultado queda en `~/Downloads/BarecaVendedores-PRODUCCION.apk`.

## Verificación manual (recomendada la primera vez)

En el log (`/tmp/bareca-build-prod.log`) busca la línea:

```
env: load .env.production.local .env.local .env.production .env
```

Debe incluir `.env.production`. Si dice solo `.env.local .env`, **`NODE_ENV` no llegó al proceso**
y el APK salió con configuración de QA.

## Prioridad de archivos en Expo (de mayor a menor)

```
.env.production.local  >  .env.local  >  .env.production  >  .env
```

Por eso `.env.local` **no debe** contener URLs ni `MONTO_REAL`: solo secretos de QA.

## Volver a QA

No hay que deshacer nada: compilar sin `NODE_ENV=production`
(`./android/gradlew -p android assembleRelease`) vuelve a generar el APK de QA.
