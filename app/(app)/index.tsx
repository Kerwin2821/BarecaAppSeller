import { Redirect } from 'expo-router'
import { useAuth } from '@/lib/auth'
import { rutaInicialPorRol } from '@/lib/roles'

/** Redirige a la pantalla inicial según el rol (getInitialRouteForRole del portal). */
export default function Index() {
  const { user } = useAuth()
  return <Redirect href={rutaInicialPorRol(user?.role) as never} />
}
