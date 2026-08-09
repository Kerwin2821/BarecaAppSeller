# Estado de Nueva Venta (app vendedores) — paridad con la web

Resumen de lo que quedó listo en el flujo **Nueva Venta**, portado 1:1 del portal
`policy-market` (asesores.barecaonline.com). Todo apunta a **QA** y cobra **1 Bs**
en débito (`EXPO_PUBLIC_MONTO_REAL=false`), para repetir pruebas.

## Flujo completo (igual a la web)

1. **Cotización**
   - **RCV:** tipo de seguro → aseguradora → clase/grupo → info de riesgo → **Cotizar Planes**
     → plan → adicionales (puestos + **APOV** real) + total.
   - **Funerario:** tipo (individual/familiar) + Nº asegurados + rango de edad → **Cotizar**
     (`/clients/opciones-coberturas`, filtra por edad) → plan (precio USD).
2. **Datos del Cliente** (`PasoCliente`): OCR cédula/carnet, tomador, **Datos de Contacto**
   (correo/teléfono), **catálogo de vehículo** (marca→modelo→versión→año) y dirección
   (estado/municipio/ciudad). El funerario oculta el bloque de vehículo.
3. **Conductor** (solo RCV): Tomador u **Otra Persona** (captura cédula/nombres/apellidos).
4. **Registro de Pago** — dirigido por `otpState`, réplica de `payment-step`:
   - Sub-stepper por método (Débito: *Ingresa Datos → Recibe SMS → Confirma*; Pago Móvil:
     *Confirma Datos → Paga → Listo*).
   - Desglose **Monto Base** (`primaAnualTCR × tasa BCV`) + **APOV** + descuento (máx. por comisión).
   - **Débito:** banco emisor + **Cédula del Titular** (V/E/J/G/P) + teléfono afiliado + gateway;
     "Solicitar Clave Dinámica (OTP)" → **Verifica tu Identidad** (OTP) → **Validando con el Banco…**
     (barra + cuenta regresiva 150 s) → éxito / recuperación sin doble cobro.
   - **Pago Móvil:** teléfono emisor + confirmación → **instrucciones R4** (Banco R4 0169,
     J-30393487-0, 0424-497-0837, monto exacto) + espera con sondeo del webhook (300 s).
   - **Éxito:** Nº de póliza + ID de transacción + descarga de **Comprobante** y **Carnet**.

## Orquestación real (`src/lib/emisionPago.ts`)

`vigente/{placa}` → staging (`add-cliente` + `addRegisterVehicle`) → `addorden-client(-pagoMovil)`
→ `debito-inmediato` (OTP) → `consultar-operacion` (20×6 s) → `payments/finalize-policy`.
Pago móvil: `webhook/status/{orden}` (60×10 s). Mapa completo de códigos de banco → mensaje.

## Cómo probar (QA, 1 Bs)

1. `EXPO_PUBLIC_MONTO_REAL=false` en `.env` (ya está) → el débito cobra **1 Bs**.
2. Login con el usuario vendedor de QA → **Nueva Venta** → RCV → cotizar → cliente → conductor → pago.
3. Débito Inmediato: banco + cédula titular + teléfono afiliado → *Solicitar Clave Dinámica* →
   ingresar el OTP que llega por SMS → *Confirmar Débito*.

## Gap deliberado

- **Casco (Auto):** queda como **"Próximamente"**. Su pago es distinto (cuotas + frecuencia +
  `solicitar-OTP` aparte + `simularCobroCasco`/`confirmCascoPayment`) y no se portó para no enviar
  un flujo de dinero a medias. Es la próxima iteración natural.

## A confirmar con quien mantiene `mi-bff`

Ver `docs/BFF-requisitos-app-movil.md` §1 (captcha del WebView) y §4 (endpoints de pago/emisión y
verificación de los payloads de staging).
