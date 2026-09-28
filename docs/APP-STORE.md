# Publicación en App Store — BARECA Vendedores

| | |
|---|---|
| Bundle ID | `com.bareca.vendedores` (App ID registrado el 27-sep-2026, con Push Notifications) |
| App Store Connect | app **6816710888** — https://appstoreconnect.apple.com/apps/6816710888 · SKU `bareca-vendedores-ios` · idioma principal Español (México) |
| Clave APNs | Key ID **6Q2B7DH922**, Team `8VJKP5NFUM`, Sandbox & Production, team-scoped. Respaldo (secreto) en `~/Downloads/bareca-apns-key/` |
| Equipo Apple | **CC CONSULTING INTERNATIONAL LLC** (`8VJKP5NFUM`, el mismo de Rueda Seguros) |
| Firma | **Manual** en el target de la app (`plugins/withManualSigning.js`): certificado «Apple Distribution: CC CONSULTING INTERNATIONAL LLC» (llavero de esta Mac, serie `4CB2E813…`, vence 26-sep-2027) + perfil **«BARECA Vendedores App Store»** (creado por API el 28-sep-2026, respaldo en `~/Downloads/bareca-ios-signing/`). La firma automática no sirve: la cuenta no tiene dispositivos y Xcode exige un perfil de desarrollo para el archive |
| Clave de API ASC | `R39LQ62973` (issuer `721a93be-082c-4138-b284-b4fd728cefc2`, rol Admin, «Bareca Vendedores CI»). `.p8` en `~/.appstoreconnect/private_keys/` y respaldo en `~/Downloads/bareca-asc-api-key/`. `compilar-appstore.sh` la lee de `ios/asc-api.env` o `~/.appstoreconnect/bareca-asc-api.env` (ambos fuera de git) y con ella sube el build sin cuenta en Xcode. `~/.appstoreconnect/asc.py` es un cliente mínimo de la API (JWT ES256 con openssl) usado para perfil, precio, disponibilidad y capturas |
| Solo iPhone | `ios.supportsTablet: false` (sin capturas ni revisión de iPad; corre en iPad en modo compatibilidad) |
| Push | FCM vía `@react-native-firebase/messaging` **solo en iOS** (`react-native.config.js`); Android sigue con expo-notifications. Requiere `GoogleService-Info.plist` (app iOS registrada en Firebase `bareca-vendedores`) y la **clave APNs** subida a Firebase |
| Cifrado | `ITSAppUsesNonExemptEncryption = false` (solo HTTPS) |

## Compilar y subir

```bash
./compilar-appstore.sh --bump        # archive → verifica prod/firma → sube a App Store Connect
./compilar-appstore.sh --solo-ipa    # deja el .ipa en ~/Downloads (para Transporter)
```

La carpeta `ios/` no está versionada: se regenera con `npx expo prebuild --platform ios --no-install`
y luego `(cd ios && pod install)`. Con este enlace lento, los artefactos precompilados de React Native
(≈300 MB en Maven) se bajan aparte y se pasan a `pod install` con
`RCT_TESTONLY_RNCORE_TARBALL_PATH`, `RCT_USE_LOCAL_RN_DEP` y `HERMES_ENGINE_TARBALL_PATH`.

## Hecho por API el 28-sep-2026
Precio **gratis** (territorio base USA), disponibilidad **solo Venezuela**, 4 capturas 6,5" (1284×2778) en es-MX, perfil App Store.
Lo que la API no cubre y se hizo/hace en la web: privacidad de la app (tipos de datos), notas de revisión, clasificación por edades.

## Ficha en App Store Connect (español latinoamericano)

La app se creó con versión «1.0»; el build lleva `1.0.1` → cambiar el número de versión en la ficha antes de asignar el build.

- **Nombre** (30): `BARECA Vendedores`
- **Subtítulo** (30): `Cotiza y emite seguros RCV`
- **Texto promocional** (170, opcional): `Cotiza, emite y cobra tus comisiones desde el celular.`
- **Descripción**: la misma de Google Play (`~/Downloads/bareca-playstore-kit/textos-ficha.md`).
- **Palabras clave** (100): `bareca,seguros,rcv,poliza,vendedores,corretaje,funerario,cotizar,comisiones,venezuela`
- **URL de soporte**: https://www.bareca.com · **URL de privacidad**: https://kerwin2821.github.io/BarecaAppSeller/privacidad-app.html
- **Categoría**: Finanzas (secundaria: Negocios) · **Precio**: gratis · **Disponibilidad**: Venezuela (como en Play)
- **Clasificación por edades**: todas las preguntas en «Ninguno» → 4+ (sin apuestas, sin acceso web sin restricciones)
- **Capturas**: iPhone 6,9" (1320×2868) obligatorias — del simulador iPhone 17 Pro Max. No hacen falta de iPad.
- **Icono**: lo toma del build (`assets/icon.png`, 1024×1024 sin alfa).

### Privacidad de la app (cuestionario «App Privacy»)
Misma información que «Seguridad de los datos» de Play. Sin seguimiento (tracking) ni publicidad.

| Categoría Apple | Tipos | Uso | Vinculado a la identidad |
|---|---|---|---|
| Información de contacto | Nombre, correo, teléfono, dirección física | Funcionalidad de la app, gestión de la cuenta | Sí |
| Identificadores | ID de usuario, ID de dispositivo (token push) | Funcionalidad de la app | Sí |
| Información financiera | Datos de pago (cuenta bancaria/pago móvil), historial de compras, otra info financiera (comisiones) | Funcionalidad de la app | Sí |
| Contenido del usuario | Fotos (cédula y carnet), otro contenido (mensajes de soporte) | Funcionalidad de la app | Sí |
| Ubicación | Ubicación precisa (solo para autocompletar la dirección, opcional) | Funcionalidad de la app | No |
| Otros datos | Número de cédula/RIF del asegurado y del vehículo | Funcionalidad de la app | Sí |

### Información para la revisión (App Review)
- **Cuenta demo**: la misma «Seller test account» de Play (usuario `aclm92@gmail.com`; la clave la escribe el dueño en App Store Connect).
- **Notas al revisor** (en inglés):
  > BARECA Vendedores is the official app for the sales network of Bareca, a licensed insurance broker in Venezuela. A seller account provisioned by Bareca is required (use the demo credentials). Login shows a Cloudflare Turnstile captcha. Policies are paid with Venezuelan bank instant debit or mobile payment (real money, outside the app — a physical insurance service, not digital content), so please do not complete a payment; the demo account lets you quote, browse sales, wallet and commissions. No third-party sign-in, no in-app purchases, no account creation inside the app (accounts are created by the company), so account deletion is handled by support (see privacy policy §5).
- **Contacto**: soporte@bareca.com · teléfono del dueño de la cuenta.

## Push en iOS: clave APNs → Firebase
1. developer.apple.com → Certificates, IDs & Profiles → **Keys** → «+» → nombre `Bareca Vendedores APNs`, marcar
   **Apple Push Notifications service (APNs)** → Continue → Register → **Download** (`AuthKey_XXXXXXXXXX.p8`, solo se
   puede bajar una vez; guardarla en `~/Downloads/bareca-apns-key/`). **Hecho el 27-sep-2026: `AuthKey_6Q2B7DH922.p8`.**
2. Firebase → proyecto `bareca-vendedores` → Configuración → **Cloud Messaging** → «Configuración de la app de Apple»
   (`com.bareca.vendedores`) → **Clave de autenticación de APNs** → subir el `.p8` + Key ID + Team ID `8VJKP5NFUM`.
3. Sin este paso el panel admin puede enviar (FCM acepta el token) pero el iPhone nunca recibe la notificación.

## Después de subir el build
1. App Store Connect → TestFlight: el build aparece en 10–30 min («Procesando»). Probarlo en un iPhone real (TestFlight)
   antes de enviar: login, cotización, PDF, push.
2. App Store → versión 1.0.1 → seleccionar el build → capturas, textos, privacidad, revisión → **Enviar a revisión**
   (Apple suele responder en 24–48 h).
3. Rechazos típicos y respuesta: 2.1 (no pueden entrar) → revisar cuenta demo/captcha; 5.1.1 (permisos) → los textos ya
   explican cámara/fotos/ubicación/Face ID; 3.1.1 (pagos) → es un servicio físico de seguros, no contenido digital.
