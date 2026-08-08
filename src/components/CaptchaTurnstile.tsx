import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'

/**
 * Renderiza el widget Cloudflare Turnstile dentro de un WebView y devuelve el
 * token al obtenerse. Es el equivalente nativo del `<div class="cf-turnstile">`
 * que el portal web usa en el login: el BFF exige `recaptchaToken`.
 *
 * El WebView se carga con `originWhitelist`/`baseUrl` en el dominio del portal
 * para que el sitekey (ligado a ese dominio en Cloudflare) valide.
 */

const SITEKEY = process.env.EXPO_PUBLIC_TURNSTILE_SITEKEY ?? ''
const HOST = process.env.EXPO_PUBLIC_TURNSTILE_HOST ?? 'https://qaasesores.barecaonline.com'

export function CaptchaTurnstile({
  onToken,
  onError,
}: {
  onToken: (token: string) => void
  onError?: (mensaje: string) => void
}) {
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
    window.onloadTurnstileCallback = function(){
      try {
        turnstile.render('#cap', {
          sitekey: '${SITEKEY}',
          callback: function(token){ post({type:'token', token:token}); },
          'error-callback': function(){ post({type:'error', message:'captcha-error'}); },
          'expired-callback': function(){ post({type:'expired'}); }
        });
      } catch (e) { post({type:'error', message:String(e)}); }
    };
    // Si la API ya cargó antes del callback:
    var t = setInterval(function(){
      if (window.turnstile) { clearInterval(t); window.onloadTurnstileCallback(); }
    }, 300);
  </script>
</body></html>`,
    [],
  )

  if (!SITEKEY) {
    return null
  }

  return (
    <View style={est.caja} pointerEvents="box-none">
      <WebView
        source={{ html, baseUrl: HOST }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        style={est.web}
        containerStyle={est.web}
        backgroundColor="transparent"
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data)
            if (msg.type === 'token' && msg.token) onToken(msg.token)
            else if (msg.type === 'error') onError?.('No se pudo verificar el captcha. Reintente.')
            else if (msg.type === 'expired') onError?.('El captcha expiró. Reintente.')
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
