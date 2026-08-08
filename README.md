# BARECA Vendedores 📱

App móvil (iOS + Android) del **portal de vendedores Winspec**: replica todas las
funcionalidades de la web administrativa de BARECA Inspección sobre React Native + Expo.

| Pantalla | Equivalente web | Contenido |
|----------|-----------------|-----------|
| Login | `/login` | Credenciales, aviso de sesión expirada, panel de marca |
| Cambio de clave | `/cambiar-clave` | Obligatorio con clave temporal (`debeCambiarClave`), medidor de fuerza |
| Dashboard | `/` | 4 KPIs, tendencia semanal/mensual, dona de asegurabilidad, inspecciones recientes |
| Mapa en Vivo | `/mapa` | Pins por criterio, inspectores en curso con foto, filtros de fecha/criterio, refresco cada 30 s |
| Expediente | `/inspecciones/:id` | Galería de 8 tomas, video, hallazgos, puntajes por grupo, observaciones, PDF |
| Usuarios | `/usuarios` | Solo rol `ADMIN`: crear, editar, reenviar clave, activar/desactivar |
| Mi Perfil | `/perfil` | Datos personales (editables solo por ADMIN), cambio de clave, cierre de sesión |

Reglas compartidas con la web: sesión de **15 minutos** con cuenta regresiva visible,
renovación por actividad (`GET /auth/me` máx. cada 90 s), cierre automático con aviso,
media protegida pedida con `Authorization: Bearer`, criterio ≥85 aprobado / 60–84 revisión / <60 rechazado.

## Ambiente (QA)

El backend al que apunta la app vive en [`.env`](.env):

```
EXPO_PUBLIC_API_URL=https://winspec.barecaonline.com/api/v1/admin
```

Para cambiar de ambiente basta editar esa URL (no contiene secretos, por eso se versiona).

## Probar en QA con el QR (ngrok)

Requiere Node 22. El teléfono **no necesita** estar en el mismo Wi-Fi: el QR sale por
túnel ngrok (`--tunnel`), así que se escanea desde cualquier red.

```bash
npm install
npm start          # = expo start --tunnel  →  muestra el QR
```

1. Instale **Expo Go** en el teléfono ([App Store](https://apps.apple.com/app/expo-go/id982107779) / [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)).
2. Escanee el QR de la terminal (Android: desde Expo Go · iOS: con la cámara).
3. La app abre apuntando a QA; entre con un usuario del portal.

> `npm run start:lan` usa la red local (más rápido) si el teléfono sí comparte Wi-Fi.

La app solo usa módulos incluidos en Expo Go (mapas, SVG, SecureStore, video), por lo
que **no hace falta development build** para QA. Para el binario de tiendas: `eas build`.

## Estructura

```
app/                 Rutas (expo-router)
  _layout.tsx        Providers + guardia de sesión (login / cambio de clave / tabs)
  login.tsx          · cambiar-clave.tsx
  (tabs)/            Dashboard · mapa · usuarios (ADMIN) · perfil
  inspecciones/[id]  Expediente digital (modal)
src/
  lib/               api.ts (contrato admin) · sesion.ts (SecureStore) · auth.tsx ·
                     tipos.ts · criterio.ts · formato.ts · tema.ts (tokens del portal)
  hooks/             useApi · useMedia (media con Authorization)
  components/        Charts (SVG a mano) · Ui · Modal · Toast · Estados · MedidorClave …
```

## Verificación

```bash
npm run typecheck   # tsc --noEmit
```
