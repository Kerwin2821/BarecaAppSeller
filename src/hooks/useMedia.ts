import { useMemo } from 'react'
import { cabecerasMedia, resolverUrl } from '../lib/api'

export interface FuenteMedia {
  uri: string
  headers: Record<string, string>
}

/**
 * Equivalente móvil del useMediaUrl del portal: en vez de descargar un blob y
 * crear un object URL, expo-image / expo-video aceptan la URL con cabeceras,
 * así que basta con resolver la ruta y adjuntar el token vigente.
 */
export function useFuenteMedia(url: string | null | undefined): FuenteMedia | null {
  return useMemo(() => {
    if (!url) return null
    return { uri: resolverUrl(url), headers: cabecerasMedia() }
  }, [url])
}
