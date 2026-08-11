import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { userApi } from '@/lib/endpoints'
import { actorUuid, etiquetaRol } from '@/lib/roles'
import { iniciales } from '@/lib/formato'
import {
  autenticarBiometria,
  biometriaDisponible,
  biometriaHabilitada,
  borrarCredencialLogin,
  setBiometriaHabilitada,
  tipoBiometria,
} from '@/lib/biometria'
import { useToast } from '@/components/Toast'
import { Pantalla } from '@/components/Pantalla'
import { Avatar, Boton, Tarjeta, TituloSeccion } from '@/components/Ui'
import { color } from '@/lib/tema'

function Dato({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <View style={est.dato}>
      <Text style={est.datoEtiqueta}>{etiqueta}</Text>
      <Text style={est.datoValor}>{valor || '—'}</Text>
    </View>
  )
}

export default function Perfil() {
  const router = useRouter()
  const { user, cerrarSesion } = useAuth()
  const { avisar } = useToast()
  const nombre = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Vendedor'

  const [bioDisponible, setBioDisponible] = useState(false)
  const [bioHabilitada, setBioHabilitada] = useState(false)
  const [bioTipo, setBioTipo] = useState('Huella')
  const [datosPago, setDatosPago] = useState<any[]>([])

  // Datos de pago del actor (cuentas para recibir comisiones), como la web.
  useEffect(() => {
    if (!user) return
    const uuid = actorUuid(user)
    if (!uuid) return
    userApi
      .datosPagosByActor(user.role, uuid)
      .then((r) => setDatosPago((r as any)?.data ?? []))
      .catch(() => setDatosPago([]))
  }, [user])

  useEffect(() => {
    ;(async () => {
      setBioDisponible(await biometriaDisponible())
      setBioHabilitada(await biometriaHabilitada())
      setBioTipo(await tipoBiometria())
    })()
  }, [])

  const alternarBio = async (v: boolean) => {
    if (v) {
      // Confirma con la huella antes de activarla.
      const ok = await autenticarBiometria(`Activar desbloqueo con ${bioTipo.toLowerCase()}`)
      if (!ok) return
      await setBiometriaHabilitada(true)
      setBioHabilitada(true)
      avisar(`Desbloqueo con ${bioTipo.toLowerCase()} activado`, 'ok')
    } else {
      await setBiometriaHabilitada(false)
      await borrarCredencialLogin()
      setBioHabilitada(false)
      avisar('Ingreso con huella desactivado', 'info')
    }
  }

  const salir = async () => {
    await cerrarSesion()
    router.replace('/login')
  }

  return (
    <Pantalla>
      <Tarjeta style={{ padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar texto={iniciales(nombre)} size={54} invertido />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={est.nombre}>{nombre}</Text>
            <Text style={est.rol}>
              {etiquetaRol(user?.role)}
              {user?.rolSecundario ? ` · ${user.rolSecundario}` : ''}
            </Text>
          </View>
        </View>
      </Tarjeta>

      <TituloSeccion>Datos de la cuenta</TituloSeccion>
      <Tarjeta style={{ padding: 16 }}>
        <Dato etiqueta="Correo" valor={user?.email} />
        <Dato etiqueta="Teléfono" valor={user?.phone} />
        <Dato etiqueta="Rol" valor={etiquetaRol(user?.role)} />
        {user?.code ? <Dato etiqueta="Código" valor={user.code} /> : null}
        {user?.comisionPrepagada !== undefined ? (
          <Dato etiqueta="Comisión prepagada" valor={user.comisionPrepagada ? 'Sí' : 'No'} />
        ) : null}
      </Tarjeta>

      <TituloSeccion>Datos de Pago</TituloSeccion>
      {datosPago.length > 0 ? (
        <View style={{ gap: 10 }}>
          {datosPago.map((p, i) => (
            <Tarjeta key={p?.datosPagosId ?? p?.id ?? i} style={{ padding: 16 }}>
              {p?.alias ? <Text style={est.pagoAlias}>{p.alias}</Text> : null}
              <Dato etiqueta="Banco" valor={p?.banco} />
              <Dato etiqueta="Teléfono" valor={p?.telefono} />
              <Dato etiqueta="Documento" valor={p?.numeroDocumento} />
            </Tarjeta>
          ))}
        </View>
      ) : (
        <Tarjeta style={{ padding: 16 }}>
          <Text style={{ fontSize: 12.5, color: color.text3, lineHeight: 18 }}>
            No tienes cuentas de pago registradas. Se configuran para recibir tus comisiones.
          </Text>
        </Tarjeta>
      )}

      <TituloSeccion>Seguridad</TituloSeccion>
      <Tarjeta style={{ padding: 16, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: color.text }}>
              Desbloqueo con {bioTipo.toLowerCase()}
            </Text>
            <Text style={{ fontSize: 11.5, color: color.text2, marginTop: 2, lineHeight: 16 }}>
              {bioDisponible
                ? `Abre el app con tu ${bioTipo.toLowerCase()} mientras tu sesión siga activa (sin repetir clave).`
                : 'Configura una huella o rostro en los ajustes de tu teléfono para activar esta opción.'}
            </Text>
          </View>
          <Switch
            value={bioHabilitada}
            onValueChange={alternarBio}
            disabled={!bioDisponible}
            trackColor={{ true: color.primary, false: '#CBD5E1' }}
            thumbColor="#fff"
          />
        </View>
      </Tarjeta>
      <Tarjeta style={{ padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 12.5, color: color.text2, lineHeight: 18 }}>
          Para cambiar tu contraseña usa el flujo de recuperación por correo.
        </Text>
        <Boton texto="Cambiar contraseña" variante="soft" onPress={() => router.push('/recuperar-contrasena')} />
      </Tarjeta>

      <View style={{ marginTop: 22 }}>
        <Boton texto="Cerrar sesión" variante="peligro" onPress={salir} />
      </View>
    </Pantalla>
  )
}

const est = StyleSheet.create({
  nombre: { fontSize: 17, fontWeight: '800', color: color.text },
  rol: { fontSize: 12, color: color.text2, marginTop: 2 },
  dato: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.borderSoft, gap: 12 },
  datoEtiqueta: { fontSize: 12, color: color.text3 },
  datoValor: { fontSize: 12.5, fontWeight: '600', color: color.text, flexShrink: 1, textAlign: 'right' },
  pagoAlias: { fontSize: 13.5, fontWeight: '800', color: color.primaryDark, marginBottom: 6 },
})
