#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Genera el AAB para GOOGLE PLAY (producción, dinero real)
#  Uso:  ./compilar-playstore.sh [--bump]
#        --bump  incrementa versionCode (obligatorio en cada subida nueva)
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/opt/node/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-$HOME/Library/Java/jdk-17.0.20+8/Contents/Home}"
rojo(){ printf "\033[31m%s\033[0m\n" "$1"; }; verde(){ printf "\033[32m%s\033[0m\n" "$1"; }

# ── Requisitos
[ -f .env.production ] || { rojo "Falta .env.production"; exit 1; }
[ -f .env.production.local ] || { rojo "Falta .env.production.local (clave del login de producción)"; exit 1; }
grep -q "PENDIENTE_PEDIR_A_BFF" .env.production.local && { rojo "La APP_KEY sigue con el valor de ejemplo"; exit 1; }
[ -f android/keystore.properties ] || { rojo "Falta android/keystore.properties (llave de subida). Respaldo: ~/Downloads/bareca-upload-key/"; exit 1; }
[ -f android/app/bareca-upload.keystore ] || { rojo "Falta android/app/bareca-upload.keystore"; exit 1; }
[ -f google-services.json ] || { rojo "Falta google-services.json (Firebase: push/FCM)"; exit 1; }
if [ -f .env.local ] && grep -qE "^EXPO_PUBLIC_(BFF_URL|MONTO_REAL|PORTAL_CLIENTE_URL|ATUALCANCE_HABILITADO)=" .env.local; then
  rojo ".env.local pisa la configuración de producción (tiene más prioridad). Quita esas líneas."; exit 1
fi

# ── Versión (Play exige versionCode creciente en cada subida)
G=android/app/build.gradle
VC=$(grep -E "^\s*versionCode " "$G" | awk '{print $2}')
VN=$(python3 -c "import json;print(json.load(open('app.json'))['expo']['version'])")
if [ "${1:-}" = "--bump" ]; then
  VC=$((VC+1))
  sed -i '' -E "s/^(\s*versionCode )[0-9]+/\1$VC/" "$G"
  sed -i '' -E "s/^(\s*versionName )\"[^\"]*\"/\1\"$VN\"/" "$G"
fi
sed -i '' -E "s/^(\s*versionName )\"[^\"]*\"/\1\"$VN\"/" "$G"

echo ""
rojo  "╔══════════════════════════════════════════════════════════╗"
rojo  "║   AAB PARA GOOGLE PLAY — PRODUCCIÓN, DINERO REAL         ║"
rojo  "╚══════════════════════════════════════════════════════════╝"
grep -E "BFF_URL|MONTO_REAL|PORTAL_CLIENTE|ATUALCANCE" .env.production | sed 's/^/   /'
echo "   versionName $VN  ·  versionCode $VC   (usa --bump para subir el código)"
echo ""
read -r -p "Escribe PLAYSTORE para continuar: " ok
[ "$ok" = "PLAYSTORE" ] || { echo "Cancelado."; exit 1; }

# ── Compilar (NODE_ENV=production + bundle invalidado)
export NODE_ENV=production
LOG="/tmp/bareca-build-play.log"
rm -rf android/app/build/generated/assets/createBundleReleaseJsAndAssets android/app/build/intermediates/assets/release android/app/build/intermediates/merged_assets/release
echo "Compilando AAB… (log: $LOG)"
./android/gradlew -p android bundleRelease --console=plain > "$LOG" 2>&1
grep -q "BUILD SUCCESSFUL" "$LOG" || { rojo "Falló la compilación. Revisa $LOG"; exit 1; }
AAB="android/app/build/outputs/bundle/release/app-release.aab"

# ── Verificaciones: firma con la llave de subida + config de producción
FIRMA=$("$JAVA_HOME/bin/keytool" -printcert -jarfile "$AAB" 2>/dev/null | grep -E "Propietario|Owner" | head -1)
echo "$FIRMA" | grep -q "Bareca C.A." || { rojo "El AAB NO está firmado con la llave de subida: $FIRMA"; exit 1; }
verde "✅ Firmado con la llave de subida ($FIRMA)"
T=$(mktemp -d); unzip -o -q "$AAB" "base/assets/index.android.bundle" -d "$T" 2>/dev/null || true
B="$T/base/assets/index.android.bundle"
if [ -f "$B" ]; then
  grep -aq "qaasesores.barecaonline.com" "$B" && { rojo "El bundle contiene la URL de QA"; rm -rf "$T"; exit 1; }
  grep -aq "asesores.barecaonline.com" "$B" && verde "✅ El bundle apunta a PRODUCCIÓN" || { rojo "No aparece la URL de producción"; rm -rf "$T"; exit 1; }
fi
rm -rf "$T"

DEST="$HOME/Downloads/BarecaVendedores-PLAYSTORE-v${VN}-${VC}.aab"
cp "$AAB" "$DEST"
verde "AAB listo: $DEST"
echo "Súbelo en Play Console → Producción (o prueba cerrada) → Crear versión, o con:  eas submit -p android --path \"$DEST\""
