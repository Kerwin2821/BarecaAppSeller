import type { ComponentType } from 'react'
import type { UserRole } from '../lib/tipos'
import {
  puedeGestionarEquipo,
  puedeVender,
  puedeVerMapa,
  puedeVerPolizas,
  puedeVerReportes,
  puedeVerRetos,
} from '../lib/roles'
import {
  IcoChat,
  IcoComisiones,
  IcoEquipo,
  IcoHome,
  IcoMapa,
  IcoPerfil,
  IcoPolizas,
  IcoReporte,
  IcoRachas,
  IcoSoporte,
  IcoVenta,
} from './Iconos'

export interface ItemMenu {
  ruta: string
  titulo: string
  subtitulo: string
  Icono: ComponentType<{ color: string; size?: number }>
  visible: (rol: UserRole | null | undefined) => boolean
  grupo: 'Operación' | 'Gestión' | 'Cuenta'
}

/** Menú del portal de vendedores, con las mismas reglas de rol del sidebar web. */
export const MENU: ItemMenu[] = [
  {
    ruta: '/',
    titulo: 'Inicio',
    subtitulo: 'Wallet y resumen',
    Icono: IcoHome,
    visible: () => true,
    grupo: 'Operación',
  },
  {
    ruta: '/nueva-venta',
    titulo: 'Nueva Venta',
    subtitulo: 'Cotizar y emitir RCV y Funerario',
    Icono: IcoVenta,
    visible: puedeVender,
    grupo: 'Operación',
  },
  {
    ruta: '/polizas',
    titulo: 'Mis Ventas',
    subtitulo: 'Pólizas emitidas',
    Icono: IcoPolizas,
    visible: puedeVerPolizas,
    grupo: 'Operación',
  },
  {
    ruta: '/comisiones',
    titulo: 'Mis Comisiones',
    subtitulo: 'Generadas y pagadas',
    Icono: IcoComisiones,
    visible: puedeVerPolizas,
    grupo: 'Operación',
  },
  {
    ruta: '/reporte',
    titulo: 'Reporte de Pólizas',
    subtitulo: 'KPIs y descargas',
    Icono: IcoReporte,
    visible: puedeVerReportes,
    grupo: 'Gestión',
  },
  {
    ruta: '/mapa-conexiones',
    titulo: 'Mapa de Conexiones',
    subtitulo: 'Red comercial',
    Icono: IcoMapa,
    visible: puedeVerMapa,
    grupo: 'Gestión',
  },
  {
    ruta: '/rachas',
    titulo: 'Mis Rachas',
    subtitulo: 'Metas e incentivos',
    Icono: IcoRachas,
    visible: puedeVerRetos,
    grupo: 'Gestión',
  },
  {
    ruta: '/equipo',
    titulo: 'Gestión de Equipo',
    subtitulo: 'Oficinas, distribuidores, kioscos',
    Icono: IcoEquipo,
    visible: puedeGestionarEquipo,
    grupo: 'Gestión',
  },
  {
    ruta: '/soporte',
    titulo: 'Soporte',
    subtitulo: 'Tickets de ayuda',
    Icono: IcoSoporte,
    visible: () => true,
    grupo: 'Cuenta',
  },
  {
    ruta: '/chat',
    titulo: 'Chat',
    subtitulo: 'Conversaciones',
    Icono: IcoChat,
    visible: () => true,
    grupo: 'Cuenta',
  },
  {
    ruta: '/perfil',
    titulo: 'Mi Perfil',
    subtitulo: 'Datos y seguridad',
    Icono: IcoPerfil,
    visible: () => true,
    grupo: 'Cuenta',
  },
]

export function menuPorRol(rol: UserRole | null | undefined): ItemMenu[] {
  return MENU.filter((m) => m.visible(rol))
}

export function tituloDeRuta(ruta: string): string {
  const base = '/' + (ruta.split('?')[0].replace(/^\//, '').split('/')[0] ?? '')
  return MENU.find((m) => m.ruta === base)?.titulo ?? 'Bareca Vendedores'
}
