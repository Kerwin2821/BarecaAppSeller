import type { UserRole } from './tipos'

/**
 * Permisos por rol (espejo de los `computed` de AuthService del portal).
 * Determinan qué entradas del menú ve cada perfil.
 */

/** Solo KIOSCO y DISTRIBUIDOR venden. Oficina Regional y Bareca NO ven "Vender". */
export function puedeVender(role: UserRole | null | undefined): boolean {
  return !!role && ['DISTRIBUIDOR', 'KIOSCO'].includes(role)
}

export function puedeGestionarEquipo(role: UserRole | null | undefined): boolean {
  return !!role && ['BARECA', 'OFICINA_REGIONAL', 'DISTRIBUIDOR'].includes(role)
}

export function puedeVerReportes(role: UserRole | null | undefined): boolean {
  return !!role && ['BARECA', 'OFICINA_REGIONAL', 'DISTRIBUIDOR', 'KIOSCO'].includes(role)
}

export function puedeVerMapa(role: UserRole | null | undefined): boolean {
  return !!role && ['BARECA', 'OFICINA_REGIONAL', 'DISTRIBUIDOR'].includes(role)
}

export function puedeVerRetos(role: UserRole | null | undefined): boolean {
  return !!role && ['OFICINA_REGIONAL', 'DISTRIBUIDOR', 'KIOSCO'].includes(role)
}

export function puedeVerPolizas(role: UserRole | null | undefined): boolean {
  return !!role && ['BARECA', 'OFICINA_REGIONAL', 'DISTRIBUIDOR', 'KIOSCO'].includes(role)
}

/** Ruta inicial tras el login: el home tipo wallet para todos los roles. */
export function rutaInicialPorRol(_role: UserRole | null | undefined): string {
  return '/'
}

export function etiquetaRol(role: UserRole | null | undefined): string {
  switch (role) {
    case 'BARECA':
      return 'Corporativo'
    case 'OFICINA_REGIONAL':
      return 'Oficina Regional'
    case 'DISTRIBUIDOR':
      return 'Distribuidor'
    case 'KIOSCO':
      return 'Kiosco'
    case 'EMPLEADO':
      return 'Empleado'
    default:
      return '—'
  }
}

/** ID numérico de entidad según el rol (para reportes: param `id`). */
export function entidadIdPorRol(user: {
  role: UserRole
  barecaEntityId?: number
  officeEntityId?: number
  distributorEntityId?: number
  kioskEntityId?: number
  employeeEntityId?: number
}): number | undefined {
  switch (user.role) {
    case 'BARECA':
      return user.barecaEntityId
    case 'OFICINA_REGIONAL':
      return user.officeEntityId
    case 'DISTRIBUIDOR':
      return user.distributorEntityId
    case 'KIOSCO':
      return user.kioskEntityId
    case 'EMPLEADO':
      return user.employeeEntityId
    default:
      return undefined
  }
}

/** UUID del actor de jerarquía según el rol (para lookups y filtros). */
export function actorUuid(user: {
  role: UserRole
  id: string
  barecaId?: string
  oficinaRegionalId?: string
  distribuidorId?: string
  kioskoId?: string
}): string | null {
  switch (user.role) {
    case 'BARECA':
      return user.barecaId ?? null
    case 'OFICINA_REGIONAL':
      return user.oficinaRegionalId ?? null
    case 'DISTRIBUIDOR':
      return user.distribuidorId ?? null
    case 'KIOSCO':
      return user.kioskoId ?? null
    case 'EMPLEADO':
      return user.id
    default:
      return null
  }
}
