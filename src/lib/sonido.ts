import { createAudioPlayer, type AudioPlayer } from 'expo-audio'
import * as Haptics from 'expo-haptics'

// Un solo reproductor reutilizable para el chime de "transacción exitosa".
let player: AudioPlayer | null = null

/** Reproduce el sonido corto de éxito + una vibración de confirmación. */
export function sonidoExito(): void {
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  } catch {
    /* dispositivo sin háptica */
  }
  try {
    if (!player) player = createAudioPlayer(require('../../assets/sonidos/exito.wav'))
    player.seekTo(0).catch(() => {})
    player.play()
  } catch {
    /* sin audio disponible: no bloquea el flujo */
  }
}
