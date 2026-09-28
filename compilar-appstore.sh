#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Compila y SUBE a App Store Connect (producción, dinero real)
#  Uso:  ./compilar-appstore.sh [--bump] [--solo-ipa]
#        --bump      incrementa ios.buildNumber en app.json (obligatorio en cada subida nueva)
#        --solo-ipa  deja el .ipa en ~/Downloads sin subirlo (para Transporter)
#  Requisito (una de dos):
#    a) Xcode con la cuenta Apple del equipo iniciada (Xcode → Ajustes → Cuentas), o
#    b) una clave de API de App Store Connect (rol Admin): el .p8 en ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
#       y las variables ASC_KEY_ID y ASC_ISSUER_ID (por defecto se leen de ios/asc-api.env, ignorado en git).
#  Con cualquiera de las dos, xcodebuild registra el App ID, crea perfiles y sube el build (-allowProvisioningUpdates).
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.gem/ruby/2.6.0/bin:$HOME/.local/opt/node/bin:$PATH"
export LANG=en_US.UTF-8
rojo(){ printf "\033[31m%s\033[0m\n" "$1"; }; verde(){ printf "\033[32m%s\033[0m\n" "$1"; }; ambar(){ printf "\033[33m%s\033[0m\n" "$1"; }

TEAM_ID="8VJKP5NFUM"        # CC CONSULTING INTERNATIONAL LLC (mismo equipo que Rueda Seguros)
SCHEME="BARECAVendedores"
WS="ios/$SCHEME.xcworkspace"
PLIST="ios/$SCHEME/Info.plist"
BUILD="build/ios"
LOG="/tmp/bareca-build-ios.log"
BUMP=0; SOLO_IPA=0
[ -f ios/asc-api.env ] && . ios/asc-api.env || { [ -f "$HOME/.appstoreconnect/bareca-asc-api.env" ] && . "$HOME/.appstoreconnect/bareca-asc-api.env"; }
AUTH=()
if [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ]; then
  KEYFILE="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
  [ -f "$KEYFILE" ] || { rojo "Falta la clave de API $KEYFILE"; exit 1; }
  AUTH=(-authenticationKeyPath "$KEYFILE" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi
# La firma manual (perfil App Store, "Apple Distribution") está en el target de la app vía plugins/withManualSigning.js;
# no se pasa por línea de comandos porque afectaría a los Pods.
for a in "$@"; do case "$a" in --bump) BUMP=1;; --solo-ipa) SOLO_IPA=1;; *) rojo "Opción desconocida: $a"; exit 1;; esac; done

# ── Requisitos (mismos guardas que Play)
[ -f .env.production ] || { rojo "Falta .env.production"; exit 1; }
[ -f .env.production.local ] || { rojo "Falta .env.production.local (clave del login de producción)"; exit 1; }
grep -q "PENDIENTE_PEDIR_A_BFF" .env.production.local && { rojo "La APP_KEY sigue con el valor de ejemplo"; exit 1; }
if [ -f .env.local ] && grep -qE "^EXPO_PUBLIC_(BFF_URL|MONTO_REAL|PORTAL_CLIENTE_URL|ATUALCANCE_HABILITADO)=" .env.local; then
  rojo ".env.local pisa la configuración de producción (tiene más prioridad). Quita esas líneas."; exit 1
fi
[ -f "$WS/contents.xcworkspacedata" ] || { rojo "Falta el proyecto iOS. Genera con:  npx expo prebuild --platform ios --no-install && (cd ios && pod install)"; exit 1; }
[ -d ios/Pods ] || { rojo "Faltan los Pods:  (cd ios && pod install)"; exit 1; }
xcodebuild -version >/dev/null 2>&1 || { rojo "No encuentro Xcode (xcode-select -p)"; exit 1; }
[ -f GoogleService-Info.plist ] || ambar "⚠ Sin GoogleService-Info.plist: el push por FCM no funcionará en iOS"

# ── Versión (App Store exige CFBundleVersion creciente en cada subida)
VN=$(python3 -c "import json;print(json.load(open('app.json'))['expo']['version'])")
BN=$(python3 -c "import json;print(json.load(open('app.json'))['expo'].get('ios',{}).get('buildNumber','1'))")
if [ "$BUMP" = 1 ]; then
  BN=$((BN+1))
  python3 - "$BN" <<'PY'
import json,sys
a=json.load(open('app.json',encoding='utf-8')); a['expo'].setdefault('ios',{})['buildNumber']=sys.argv[1]
json.dump(a,open('app.json','w',encoding='utf-8'),ensure_ascii=False,indent=2); open('app.json','a').write('\n')
PY
fi
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VN" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BN" "$PLIST"

echo ""
rojo  "╔══════════════════════════════════════════════════════════╗"
rojo  "║   BUILD PARA APP STORE — PRODUCCIÓN, DINERO REAL         ║"
rojo  "╚══════════════════════════════════════════════════════════╝"
grep -E "BFF_URL|MONTO_REAL|PORTAL_CLIENTE|ATUALCANCE" .env.production | sed 's/^/   /'
echo "   versión $VN  ·  build $BN   (usa --bump para subir el número de build)"
echo "   firma: $([ -n "${ASC_PROFILE_NAME:-}" ] && echo "manual · perfil «$ASC_PROFILE_NAME»" || echo automática)"
echo "   equipo Apple: $TEAM_ID  ·  $([ "$SOLO_IPA" = 1 ] && echo 'solo genera el .ipa' || echo 'sube a App Store Connect')  ·  auth: $([ -n "${ASC_KEY_ID:-}" ] && echo "clave API $ASC_KEY_ID" || echo 'cuenta de Xcode')"
echo ""
read -r -p "Escribe APPSTORE para continuar: " ok
[ "$ok" = "APPSTORE" ] || { echo "Cancelado."; exit 1; }

# ── Archive (NODE_ENV=production → carga .env.production + .env.production.local)
export NODE_ENV=production
rm -rf "$BUILD"; mkdir -p "$BUILD"
ARCHIVE="$BUILD/$SCHEME.xcarchive"
echo "Compilando (archive)… (log: $LOG)"
xcodebuild -workspace "$WS" -scheme "$SCHEME" -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" archive -allowProvisioningUpdates ${AUTH[@]+"${AUTH[@]}"} \
  > "$LOG" 2>&1 \
  || { rojo "Falló el archive. Revisa $LOG"; grep -E "error:|No profiles|Provisioning|Signing" "$LOG" | head -10; exit 1; }

# ── Verificaciones: config de producción, equipo de firma, sin micrófono
APP="$ARCHIVE/Products/Applications/$SCHEME.app"
B="$APP/main.jsbundle"
[ -f "$B" ] || { rojo "No aparece main.jsbundle en el archive"; exit 1; }
grep -aq "qaasesores.barecaonline.com" "$B" && { rojo "El bundle contiene la URL de QA"; exit 1; }
grep -aq "asesores.barecaonline.com" "$B" && verde "✅ El bundle apunta a PRODUCCIÓN" || { rojo "No aparece la URL de producción"; exit 1; }
codesign -dv "$APP" 2>&1 | grep -q "TeamIdentifier=$TEAM_ID" && verde "✅ Firmado por el equipo $TEAM_ID" || { rojo "El app no está firmado por $TEAM_ID"; exit 1; }
/usr/libexec/PlistBuddy -c "Print :NSMicrophoneUsageDescription" "$APP/Info.plist" >/dev/null 2>&1 && { rojo "El app pide micrófono (no debería)"; exit 1; }
verde "✅ Versión $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist") ($(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist"))"

# ── Export: sube a App Store Connect (o deja el .ipa)
DESTINO=$([ "$SOLO_IPA" = 1 ] && echo export || echo upload)
cat > "$BUILD/exportOptions.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$DESTINO</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>$([ -n "${ASC_PROFILE_NAME:-}" ] && echo manual || echo automatic)</string>
$([ -n "${ASC_PROFILE_NAME:-}" ] && printf '  <key>signingCertificate</key><string>Apple Distribution</string>\n  <key>provisioningProfiles</key><dict><key>com.bareca.vendedores</key><string>%s</string></dict>\n' "$ASC_PROFILE_NAME")
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PL
echo "Exportando ($DESTINO)…"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$BUILD/exportOptions.plist" \
  -exportPath "$BUILD/export" -allowProvisioningUpdates ${AUTH[@]+"${AUTH[@]}"} >> "$LOG" 2>&1 \
  || { rojo "Falló el export/subida. Revisa $LOG"; grep -E "error:|Error|failed" "$LOG" | tail -8; exit 1; }

if [ "$SOLO_IPA" = 1 ]; then
  DEST="$HOME/Downloads/BarecaVendedores-APPSTORE-v${VN}-${BN}.ipa"
  cp "$BUILD/export/$SCHEME.ipa" "$DEST"
  verde "IPA listo: $DEST  (súbelo con Transporter)"
else
  verde "✅ Build $VN ($BN) subido a App Store Connect. Aparece en TestFlight en 10–30 min; luego se asigna a la versión en la ficha."
fi
