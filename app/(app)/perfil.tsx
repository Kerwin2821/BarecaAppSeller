import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth'
import { etiquetaRol } from '@/lib/roles'
import { iniciales } from '@/lib/formato'
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
  const nombre = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Vendedor'

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

      <TituloSeccion>Seguridad</TituloSeccion>
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
})
