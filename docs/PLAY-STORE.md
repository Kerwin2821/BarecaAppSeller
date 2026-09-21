# Publicar en Google Play — BARECA Vendedores

Cuenta de desarrollador: **kerwin2821@gmail.com** · Firebase (push/chat): **cerdkingtech2821@gmail.com**
Paquete: `com.bareca.vendedores`

## Lo que ya está hecho en el proyecto

| Pieza | Dónde |
|---|---|
| Llave de subida (upload key) | `android/app/bareca-upload.keystore` + `android/keystore.properties` (**no versionados**). Respaldo: `~/Downloads/bareca-upload-key/` → guardar en gestor de contraseñas |
| Firma de release con esa llave | `android/app/build.gradle` (si no existe `keystore.properties`, firma con debug como antes → QA no cambia) |
| Generador del AAB | `./compilar-playstore.sh [--bump]` — producción, verifica firma y URLs dentro del bundle, deja `~/Downloads/BarecaVendedores-PLAYSTORE-v<ver>-<code>.aab` |
| Kit de la ficha | `~/Downloads/bareca-playstore-kit/`: icono 512, gráfico destacado, textos, política de privacidad, respuestas de «Seguridad de datos» |

⚠️ Los APK anteriores iban firmados con la llave de **debug**. El AAB de Play va con la llave de subida: un usuario con el APK viejo instalado **no podrá actualizar desde Play** sin desinstalar (firma distinta). Es normal en la primera publicación.

## Versionado
Cada subida a Play necesita un `versionCode` mayor. `./compilar-playstore.sh --bump` lo incrementa en `android/app/build.gradle`; el `versionName` se toma de `app.json` (`expo.version`).

## Pasos en Play Console (los hace el dueño de la cuenta)

1. **Cuenta de desarrollador** en https://play.google.com/console con kerwin2821@gmail.com (pago único de USD 25 + verificación de identidad).
   - **Recomendado registrarla como ORGANIZACIÓN (Bareca C.A.)**, no personal: las cuentas personales nuevas deben hacer una **prueba cerrada con 12 testers durante 14 días** antes de poder publicar en producción. La de organización no tiene ese requisito (pide D-U-N-S y verificación de la empresa).
2. **Crear la app**: nombre «BARECA Vendedores», app, gratis, idioma español (Venezuela).
3. **Configuración de la app** (panel «Configura tu app»): política de privacidad (`https://kerwin2821.github.io/BarecaAppSeller/privacidad-app.html`, publicada desde la rama `gh-pages` de este repo), acceso a la app (**usuario y clave de prueba de PRODUCCIÓN para los revisores** — sin eso Google rechaza), anuncios (no), clasificación de contenido (cuestionario), público objetivo (18+), seguridad de los datos (respuestas en el kit), categoría Finanzas, datos de contacto.
4. **Ficha de la tienda**: textos, icono 512, gráfico 1024×500 y 2–8 capturas 9:16 (kit).
5. **Firma de apps de Play**: al subir el primer AAB, aceptar que Google gestione la clave de firma; la llave de subida se registra sola.
6. **Subir el AAB**: Prueba interna → Producción, o directamente Producción.

## «Sincronizar con Claude»: subir versiones desde aquí sin entrar a la consola

Con una **cuenta de servicio** de Google, Claude puede subir cada AAB con `eas submit` (la CLI de Expo ya está autenticada como `cerdkingtech2821`):

1. En Play Console → **Usuarios y permisos → Invitar usuarios / Cuentas de servicio** (o Google Cloud → IAM → Cuentas de servicio del proyecto vinculado): crear `play-publisher@…`, crear **clave JSON** y descargarla.
2. En Play Console darle a esa cuenta el permiso **«Administrador de versiones»** sobre la app.
3. Guardar el JSON como `android/play-service-account.json` (ya ignorado por git) o pasárselo a Claude.
4. Subir: `npx eas submit -p android --path ~/Downloads/BarecaVendedores-PLAYSTORE-v1.0.0-1.aab --key android/play-service-account.json --track internal`
   (`--track production` cuando toque). La **primera** subida de una app nueva debe hacerse a mano en la consola; las siguientes ya pueden ir por API.

## Firebase (notificaciones push y chat)

| Uso | Proyecto | Cuenta | Archivo |
|---|---|---|---|
| **Push (FCM)** | **`bareca-vendedores`** (nº 87979179973) — creado el 21-sep-2026 | **kerwin2821@gmail.com** | `google-services.json` (raíz y `android/app/`, no versionado) |
| Chat de soporte (Firestore), compartido con web y admin | `bareca-d9254` | equipo web | `.env` → `EXPO_PUBLIC_FIREBASE_*` |

- Cloud Messaging **API V1: habilitada**; la API heredada está deshabilitada (correcto).
- ⚠️ **El panel administrativo que envía los pushes debe cambiar a este proyecto**: necesita una clave de
  cuenta de servicio de `bareca-vendedores` (Firebase → Configuración → Cuentas de servicio → Generar clave)
  y enviar por la API HTTP v1. Mientras siga apuntando a `bareca-2b2da`, los tokens se registran pero **no llega
  ninguna notificación**.
- El proyecto anterior `bareca-2b2da` (cuenta cerdkingtech2821) queda sin uso por el app.
- El **chat** no se toca: moverlo solo en el app rompería el soporte (web, admin y app deben ir juntos).

## Firmas: dos flujos distintos

| Artefacto | Firma | Por qué |
|---|---|---|
| APK por WhatsApp (`compilar-produccion.sh`) | **debug** (la de siempre, `-PfirmaDebug=true`) | Actualiza sobre lo ya instalado sin desinstalar |
| AAB para Play (`compilar-playstore.sh`) | **llave de subida** `bareca-upload` | Requisito de Play; Google re-firma con su clave de apps |

Consecuencia: la versión de Play y la de WhatsApp **no se actualizan una sobre otra** (firmas distintas). Un vendedor
migra de una a otra desinstalando primero.

## Antes de la primera publicación
- [x] Política de privacidad publicada en https://kerwin2821.github.io/BarecaAppSeller/privacidad-app.html (rama `gh-pages`). Si algún día se mueve a bareca.com, cambiar la URL en Play Console → «Política de privacidad» y en «Seguridad de los datos» (URL de eliminación de datos).
- [ ] Usuario de prueba de producción para los revisores de Google
- [ ] Confirmar correo de soporte (soporte@bareca.com)
- [ ] Capturas de pantalla (2–8)
- [x] App creada bajo la organización que ya tenía la cuenta (sin requisito de 12 testers)
- [x] `RECORD_AUDIO` eliminado: `android.blockedPermissions` en `app.json` (lo aplica `expo prebuild`) + `tools:node="remove"` en `android/app/src/main/AndroidManifest.xml`. Verificar con `aapt2 dump permissions` (APK) o `unzip -p x.aab base/manifest/AndroidManifest.xml | strings | grep RECORD_AUDIO` (AAB).

## La carpeta `android/` no está versionada

`/android` está en `.gitignore`, así que estos ajustes viven solo en esta máquina y hay que reaplicarlos tras un
`expo prebuild --clean` o en otra máquina:

- `android/app/build.gradle`: bloque `signingConfigs.upload` leyendo `android/keystore.properties` (ver `compilar-playstore.sh`).
- `android/keystore.properties` + `android/app/bareca-upload.keystore` (respaldo en `~/Downloads/bareca-upload-key/`).
- `android/app/google-services.json` (proyecto Firebase `bareca-vendedores`).
- `AndroidManifest.xml`: `xmlns:tools` + `<uses-permission android:name="android.permission.RECORD_AUDIO" tools:node="remove"/>`
  (con `expo prebuild` lo genera solo a partir de `blockedPermissions` en `app.json`).

## Estado en Play Console (21-sep-2026)

**Enviada a revisión** el 21-sep-2026: versión de producción `1 (1.0.0)` (AAB `BarecaVendedores-PLAYSTORE-v1.0.0-1.aab`,
firma de apps de Play), país Venezuela, notas de la versión en es-419. La revisión de Google suele tardar hasta 7 días;
el estado se sigue en «Resumen de publicación → Actividad de envíos». Publicación gestionada: desactivada (se publica
sola al aprobarse).

Declaraciones completadas: política de privacidad, datos de inicio de sesión (cuenta de prueba «Seller test account»
= usuario vendedor de producción; la clave la tecleó el dueño), anuncios (no), clasificación IARC (PEGI 3), audiencia
objetivo (18+), seguridad de los datos (desde `docs/play/data_safety.csv`), apps gubernamentales (no), funciones
financieras (seguros), salud (sin funciones), ID de publicidad (no la usa; el AAB no declara `AD_ID`). Ficha completa
(textos, icono, gráfico destacado, 4 capturas 1080×1920 en teléfono y tablets 7"/10" tomadas del emulador, en
`~/Downloads/bareca-playstore-kit/capturas/`), categoría Finanzas y contacto soporte@bareca.com / www.bareca.com.

Única advertencia de la versión: sin archivo de desofuscación (R8/ProGuard). Es informativa.

### Próximas versiones
1. `./compilar-playstore.sh --bump` (sube `versionCode`), verifica firma y URL de producción.
2. Play Console → Producción → Crear nueva versión → arrastrar el AAB (78 MB; supera el límite de subida por navegador
   de Claude) → notas de la versión → Siguiente → Guardar → Resumen de publicación → Enviar a revisión.
3. Si el AAB pasa a declarar `AD_ID` (p.ej. por un SDK de analítica), cambiar la declaración de ID de publicidad a «Sí».
