import { useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'

/**
 * Renderiza el widget Cloudflare Turnstile dentro de un WebView y devuelve el
 * token al obtenerse. Es el equivalente nativo del `<div class="cf-turnstile">`
 * del login web: el BFF exige `recaptchaToken` y lo revalida contra
 * `siteverify` (single-use, expira ~300s).
 *
 * Los tokens de Turnstile son de **un solo uso**: si el login falla hay que
 * pedir uno nuevo con `turnstile.reset()`. Por eso `resetKey`: cada vez que
 * cambia, el widget se reinicia y emite un token fresco.
 */

const SITEKEY = process.env.EXPO_PUBLIC_TURNSTILE_SITEKEY ?? ''
const HOST = process.env.EXPO_PUBLIC_TURNSTILE_HOST ?? 'https://qaasesores.barecaonline.com'

export function CaptchaTurnstile({
  onToken,
  onError,
  resetKey = 0,
}: {
  onToken: (token: string) => void
  onError?: (mensaje: string) => void
  /** Cambiar este número reinicia el captcha y pide un token nuevo. */
  resetKey?: number
}) {
  const webRef = useRef<WebView>(null)

  // Reinicio del widget cuando el padre incrementa resetKey (p. ej. tras un
  // login fallido): turnstile.reset() vuelve a resolver y emite token fresco.
  useEffect(() => {
    if (resetKey > 0) {
      webRef.current?.injectJavaScript('try{window.turnstile&&turnstile.reset()}catch(e){};true;')
    }
  }, [resetKey])

  const html = useMemo(
    () => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
<style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;
    display:flex;align-items:center;justify-content:center;min-height:74px;font-family:-apple-system,Roboto,sans-serif}
  #cap{transform:scale(1)}
</style></head>
<body>
  <div id="cap"></div>
  <script>
    function post(msg){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
    var rendered = false;
    function render(){
      if (rendered || !window.turnstile) return;
      rendered = true;
      try {
        turnstile.render('#cap', {
          sitekey: '${SITEKEY}',
          retry: 'auto',
          'refresh-expired': 'auto',
          callback: function(token){ post({type:'token', token:token}); },
          'error-callback': function(c){ post({type:'error', code:c}); },
          'expired-callback': function(){ post({type:'expired'}); }
        });
      } catch (e) { post({type:'error', message:String(e)}); }
    }
    var t = setInterval(function(){ if (window.turnstile) { clearInterval(t); render(); } }, 250);
  </script>
</body></html>`,
    [],
  )

  if (!SITEKEY) return null

  return (
    <View style={est.caja} pointerEvents="box-none">
      <WebView
        ref={webRef}
        source={{ html, baseUrl: HOST }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        style={est.web}
        containerStyle={est.web}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data)
            if (msg.type === 'token' && msg.token) onToken(msg.token)
            else if (msg.type === 'expired') onError?.('El captcha expiró. Reintenta.')
            else if (msg.type === 'error') onError?.('No se pudo verificar el captcha. Reintenta.')
          } catch {
            // ignorar mensajes malformados
          }
        }}
      />
    </View>
  )
}

const est = StyleSheet.create({
  caja: { height: 78, width: '100%' },
  web: { flex: 1, backgroundColor: 'transparent' },
})
