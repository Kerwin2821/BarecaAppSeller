// Fuerza a @react-native-firebase a resolver el SDK de Firebase por CocoaPods en vez de
// Swift Package Manager. Con SPM, Xcode clona el repo completo de firebase-ios-sdk (y sus
// dependencias) en cada máquina nueva; con CocoaPods los pods se cachean y se pueden servir
// desde un espejo local (ver docs/APP-STORE.md).
const { withDangerousMod } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

const LINEA = '$RNFirebaseDisableSPM = true'

module.exports = function withFirebaseCocoaPods(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile')
      let s = fs.readFileSync(podfile, 'utf8')
      if (!s.includes(LINEA)) s = `${LINEA}\n${s}`
      fs.writeFileSync(podfile, s)
      return cfg
    },
  ])
}
