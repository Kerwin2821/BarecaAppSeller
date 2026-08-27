#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Compila el APK de PRODUCCIÓN  —  ⚠️ DINERO REAL
#  Uso:  ./compilar-produccion.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

export PATH="$HOME/.local/opt/node/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-$HOME/Library/Java/jdk-17.0.20+8/Contents/Home}"

rojo(){ printf "\033[31m%s\033[0m\n" "$1"; }
verde(){ printf "\033[32m%s\033[0m\n" "$1"; }

# ── 1. La configuración de producción debe existir
[ -f .env.production ] || { rojo "Falta .env.production"; exit 1; }

# ── 2. La clave del login debe estar cargada de verdad
if [ ! -f .env.production.local ]; then
  rojo "Falta .env.production.local (la clave del login de producción)."
  echo  "   Copia .env.production.local.ejemplo y pon la APP_LOGIN_KEY real del BFF."
  exit 1
fi
if grep -q "PENDIENTE_PEDIR_A_BFF" .env.production.local; then
  rojo "La EXPO_PUBLIC_APP_KEY sigue con el valor de ejemplo."
  echo  "   Sin la clave real de producción el login devolverá 401 INVALID_APP_KEY."
  exit 1
fi

# ── 3. .env.local no debe pisar la configuración de producción
#      (en Expo, .env.local tiene más prioridad que .env.production)
if [ -f .env.local ] && grep -qE "^EXPO_PUBLIC_(BFF_URL|MONTO_REAL|PORTAL_CLIENTE_URL)=" .env.local; then
  rojo ".env.local define BFF_URL / MONTO_REAL / PORTAL_CLIENTE_URL y TIENE PRIORIDAD sobre .env.production."
  echo  "   Quita esas líneas de .env.local o el APK saldrá apuntando a QA."
  exit 1
fi

# ── 4. Confirmación consciente
echo ""
rojo  "╔══════════════════════════════════════════════════════════╗"
rojo  "║   APK DE PRODUCCIÓN — COBRA DINERO REAL AL CLIENTE       ║"
rojo  "╚══════════════════════════════════════════════════════════╝"
grep -E "BFF_URL|MONTO_REAL|PORTAL_CLIENTE" .env.production | sed 's/^/   /'
echo ""
read -r -p "Escribe PRODUCCION para continuar: " ok
[ "$ok" = "PRODUCCION" ] || { echo "Cancelado."; exit 1; }

# ── 5. Compilar con NODE_ENV=production (obligatorio para que cargue .env.production)
export NODE_ENV=production
LOG="/tmp/bareca-build-prod.log"

# Gradle NO considera los .env como entrada de la tarea del bundle: si no cambió
# ningún archivo fuente la marca UP-TO-DATE y reutiliza el bundle anterior (con la
# configuración de QA dentro). Hay que invalidarla a mano o el APK sale mal.
echo "Invalidando el bundle JS anterior…"
rm -rf android/app/build/generated/assets/createBundleReleaseJsAndAssets
rm -rf android/app/build/intermediates/assets/release
rm -rf android/app/build/intermediates/merged_assets/release

echo "Compilando… (log: $LOG)"
./android/gradlew -p android assembleRelease --console=plain > "$LOG" 2>&1

grep -q "BUILD SUCCESSFUL" "$LOG" || { rojo "Falló la compilación. Revisa $LOG"; exit 1; }

# ── 6. Verificar que el bundle quedó apuntando a PRODUCCIÓN (no a QA)
APK="android/app/build/outputs/apk/release/app-release.apk"
TMP=$(mktemp -d); unzip -o -q "$APK" "assets/index.android.bundle" -d "$TMP"
if grep -aq "qaasesores.barecaonline.com" "$TMP/assets/index.android.bundle"; then
  rojo "⚠️ El bundle TODAVÍA contiene la URL de QA. Revisa la carga de variables."
  echo  "   En el log busca la línea 'env: load ...' y confirma que incluye .env.production"
  rm -rf "$TMP"; exit 1
fi
grep -aq "asesores.barecaonline.com" "$TMP/assets/index.android.bundle" \
  && verde "✅ Verificado: el bundle apunta a PRODUCCIÓN." \
  || { rojo "No se encontró la URL de producción en el bundle."; rm -rf "$TMP"; exit 1; }
rm -rf "$TMP"

DEST="$HOME/Downloads/BarecaVendedores-PRODUCCION.apk"
cp "$APK" "$DEST"
verde "APK listo: $DEST"
