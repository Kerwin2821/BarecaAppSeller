# Notificaciones push (FCM) — BARECA Vendedores

**El "token" que guardas para enviar la notificación = el token de registro FCM del dispositivo.**
El app ya lo obtiene (`src/lib/push.ts` → `getDevicePushTokenAsync`) y lo envía al backend tras el
login (`notifApi.registrarDispositivo`). Además, el **Perfil** muestra el token en un recuadro
(«Notificaciones push») para copiarlo en la prueba.

> ⚠️ **Requiere un development build.** Expo Go en Android (SDK 54) ya no entrega tokens de push.
> En Expo Go el registro falla en silencio (no rompe el login); solo funciona en un dev/prod build.

## Estado actual (ya configurado)

- Proyecto Firebase de prueba: **`bareca-2b2da`** (creado por el usuario). Package `com.bareca.vendedores`.
- `google-services.json` **ya colocado** en la raíz del app y enlazado en `app.json`
  (`android.googleServicesFile`).
- Plugin `expo-notifications` agregado; `eas.json` listo (perfiles `development` / `preview`).
- **Falta:** hacer el build e instalar en un teléfono físico, y (para envío automático) el endpoint del backend.

### Cómo probar YA
```bash
npx eas-cli login                                   # cuenta Expo gratis
npx eas-cli build -p android --profile preview      # APK instalable (la 1ª vez crea el projectId)
```
Instala el APK en un **teléfono físico** → inicia sesión → acepta el permiso de notificaciones →
**Perfil** muestra el token → cópialo → en Firebase Console (`bareca-2b2da`) → **Messaging → Enviar
mensaje de prueba** → pega el token → llega la notificación.

---

## 1. Firebase (Google) — una sola vez

Proyecto Firebase: **`bareca-d9254`** (el mismo del chat de soporte).

1. Firebase Console → ⚙️ **Configuración del proyecto** → pestaña **Tus apps** → **Agregar app** → **Android**.
   - **Nombre del paquete de Android:** `com.bareca.vendedores` (debe ser EXACTO, es el de `app.json`).
   - Apodo y SHA-1: opcionales para FCM.
   - Descarga **`google-services.json`**.
2. Coloca `google-services.json` en la **raíz** del proyecto del app:
   `~/Plaza/Seguro/AppVendedores/google-services.json`
3. **Para ENVIAR desde tu backend/panel administrativo:**
   Configuración del proyecto → **Cuentas de servicio** → **Generar nueva clave privada** → descarga el JSON.
   Con esa credencial el admin envía por **FCM HTTP v1** (Firebase Admin SDK). *(No uses la "Server key"
   legacy: está deprecada.)*
4. *(iOS, opcional/después)* Agregar app iOS con bundle `com.bareca.vendedores` y subir la **APNs Auth Key**
   en Cloud Messaging.

## 2. app.json — enlazar el google-services.json

Después de colocar el archivo, agrega dentro de `"android"` en `app.json`:

```json
"android": {
  "package": "com.bareca.vendedores",
  "googleServicesFile": "./google-services.json",
  "adaptiveIcon": { "...": "..." },
  "softwareKeyboardLayoutMode": "pan"
}
```

*(El plugin `expo-notifications` ya está agregado en `app.json`.)*

## 3. Development build (obligatorio para push)

Expo Go **no** sirve para push en Android. Opciones:

- **EAS (en la nube, recomendado):**
  ```bash
  npx eas-cli login
  npx eas-cli build:configure       # crea eas.json + projectId
  npx eas-cli build -p android --profile development
  ```
  Instala el APK/AAB en un **teléfono físico**.
- **Local:** `npx expo run:android` (requiere Android Studio + SDK).

Prueba en un **dispositivo físico** (los emuladores no entregan token real).

## 4. Backend — guardar el token

El app hace `POST /api/notifications/dispositivos/v1/registrar-token` con:

```json
{
  "loginId": "…",
  "tipoActor": "DISTRIBUIDOR",
  "actorUuid": "…",
  "deviceId": "…",
  "token": "<FCM token>",
  "plataforma": "ANDROID"
}
```

Crea/ajusta esa ruta en el BFF/backend y guarda `token` en el campo correspondiente.
*(Si tu ruta queda con otro nombre o payload, dímelo y lo cambio en `src/lib/endpoints.ts`.)*

## 5. Probar que llega la notificación

1. Abre el app (dev build) e inicia sesión → **concede el permiso** de notificaciones.
   El token FCM se registra (en consola verás `[push] token FCM registrado: …`).
2. Firebase Console → **Messaging** → **Enviar mensaje de prueba** ("Send test message"):
   - Escribe título/cuerpo → **Enviar mensaje de prueba** → pega el **token FCM** del dispositivo → **Probar**.
   - Debe llegar al teléfono (en background/cerrado sale en la bandeja; en primer plano la maneja el handler del app).
3. Desde tu backend/admin: usa el service account (paso 1.3) + FCM HTTP v1 con el `token` guardado.

## Notas

- Android 13+ pide el permiso de notificaciones en runtime (el app ya lo solicita).
- El `deviceId` (UUID estable) también se envía, por si quieres deduplicar por dispositivo.
- El captcha del login fue **removido** (el BFF ya no lo exige).
