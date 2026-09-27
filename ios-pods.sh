#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Instala los Pods de iOS usando los artefactos precompilados de React Native
#  descargados aparte (el enlace de esta oficina corta las descargas grandes).
#  Uso:  ./ios-pods.sh [carpeta-con-tarballs]   (por defecto ~/Downloads/rn-artefactos-0.81.5)
#
#  Tarballs (Maven Central, com/facebook/react/react-native-artifacts/0.81.5/):
#    react-native-artifacts-0.81.5-reactnative-core-release.tar.gz
#    react-native-artifacts-0.81.5-reactnative-dependencies-release.tar.gz
#    react-native-artifacts-0.81.5-hermes-ios-release.tar.gz
#  Se usan las variantes RELEASE porque solo compilamos en Release (App Store y capturas):
#  mezclar la variante debug con un build Release rompe el ABI de `Props` y el app cierra al abrir.
#  Espejos git locales opcionales (si GitHub corta los clones): $ESPEJOS/firebase-ios-sdk y
#  $ESPEJOS/zxingify-objc, repos con las etiquetas CocoaPods-12.18.0 y 3.6.9.
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH" LANG=en_US.UTF-8
ART="${1:-$HOME/Downloads/rn-artefactos-0.81.5}"
ESPEJOS="${ESPEJOS:-$HOME/Downloads/rn-artefactos-0.81.5/git-espejos}"
V=$(node -p "require('react-native/package.json').version")
[ -d ios ] || { echo "Falta ios/: npx expo prebuild --platform ios --no-install"; exit 1; }
for f in reactnative-core-release reactnative-dependencies-release hermes-ios-release; do
  [ -f "$ART/react-native-artifacts-$V-$f.tar.gz" ] || { echo "Falta $ART/react-native-artifacts-$V-$f.tar.gz"; exit 1; }
done
export RCT_TESTONLY_RNCORE_TARBALL_PATH="$ART/react-native-artifacts-$V-reactnative-core-release.tar.gz"
export RCT_USE_LOCAL_RN_DEP="$ART/react-native-artifacts-$V-reactnative-dependencies-release.tar.gz"
export HERMES_ENGINE_TARBALL_PATH="$ART/react-native-artifacts-$V-hermes-ios-release.tar.gz"
n=0
if [ -d "$ESPEJOS/firebase-ios-sdk" ]; then export GIT_CONFIG_KEY_$n="url.file://$ESPEJOS/firebase-ios-sdk.insteadOf" GIT_CONFIG_VALUE_$n="https://github.com/firebase/firebase-ios-sdk.git"; n=$((n+1)); fi
if [ -d "$ESPEJOS/zxingify-objc" ]; then export GIT_CONFIG_KEY_$n="url.file://$ESPEJOS/zxingify-objc.insteadOf" GIT_CONFIG_VALUE_$n="https://github.com/zxingify/zxingify-objc.git"; n=$((n+1)); fi
export GIT_CONFIG_COUNT=$n
( cd ios && pod install )
echo "Pods listos (React $(du -sh ios/Pods/React-Core-prebuilt/React.xcframework | cut -f1), Hermes $(du -sh ios/Pods/hermes-engine/destroot | cut -f1))"
