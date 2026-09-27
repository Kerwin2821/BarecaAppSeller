// Firebase nativo (@react-native-firebase) SOLO en iOS: ahí hace falta para obtener el
// token de registro FCM (expo-notifications solo entrega el token APNs, que FCM no acepta).
// En Android el token FCM ya lo entrega expo-notifications con google-services.json y no
// queremos dos servicios de FCM compitiendo. En JS solo se importa bajo Platform.OS === 'ios'
// (ver src/lib/push.ts).
module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms: { android: null } },
    '@react-native-firebase/messaging': { platforms: { android: null } },
  },
}
