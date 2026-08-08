/**
 * Modelos espejo del contrato del BFF de Bareca (portal de vendedores).
 * Reconstruidos de los services del portal Angular `policy-market`.
 */

// ── Roles / jerarquía comercial ─────────────────────────────
export type UserRole = 'BARECA' | 'OFICINA_REGIONAL' | 'DISTRIBUIDOR' | 'KIOSCO' | 'EMPLEADO'

/** Envoltorio de respuesta del BFF (varía entre `{data,statusCode,message}` y `{success,data}`). */
export interface ApiResponse<T> {
  data: T
  statusCode?: number
  message?: string
  success?: boolean
}

// ── Autenticación ───────────────────────────────────────────

export interface ValidateLoginPayload {
  pass: string
  dispositive: string
  recaptchaToken?: string
  deviceId?: string
  productKey?: string
  latitud?: string
  longitud?: string
  correo?: string
  telefono?: string
  usuario?: string
}

export interface ValidateTokenClaims {
  loginId: string
  empleadoId: string
  barecaId?: string
  oficinaRegionalId?: string
  distribuidorId?: string
  KioscoId?: string
  email?: string
}

/** Usuario en sesión (equivalente a CurrentUser del portal). */
export interface CurrentUser {
  id: string
  loginId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  code?: string
  role: UserRole
  rolSecundario: string

  barecaId?: string
  oficinaRegionalId?: string
  distribuidorId?: string
  kioskoId?: string

  barecaEntityId?: number
  officeEntityId?: number
  distributorEntityId?: number
  kioskEntityId?: number
  employeeEntityId?: number

  comisionPrepagada?: boolean
  associatedProductsIds: string[]
}

export interface PasswordInfo {
  duracionPass?: number
  fechaCreacion?: string
  expirado?: boolean
}

// ── Pólizas (Mis Ventas) ────────────────────────────────────

export type PolicyCategory = 'vehicle' | 'funeral' | 'auto'
export type PolicyStatus = 'Vigente' | 'Inactiva' | 'Procesado' | 'Otro'

export interface DisplayPolicy {
  id: string
  policyNumber: string
  category: PolicyCategory
  clientName: string
  clientDocument: string
  productName: string
  orderNumber: string
  saleDate: string
  startDate: string
  endDate: string
  status: PolicyStatus
  sellerName: string
  sellerDocument: string
  vehicleDetails?: {
    plate: string
    make: string
    model: string
    serialNIV: string
    year: string
    vehicleType: string
    vehicleUse: string
  }
  rcvPlanDetails?: {
    coverageType: string
    insuranceClass: string
    groupDescription: string
    plateType: string
    sumAssuredThings: number
    sumAssuredPeople: number
    primaAnualTCR: number
  }
  financials?: {
    totalPremium: number
    currency: string
    paymentMethod: string
    referenceNumber: string
    rcvAmount: number
    conversionRate: number
    additionalTotal: number
    planTotal: number
  }
}

/** PDFs regenerados de una póliza (cuadro + carnet). */
export interface PolicyPdfs {
  poliza?: string | null
  carnet?: string | null
}

// ── Notificaciones (campana) ────────────────────────────────
export interface Notificacion {
  id: number
  titulo: string
  mensaje: string
  fecha?: string
  tipoDestinoEspecifico?: string | null
  perfilesDestino?: string | null
  leida?: boolean
}

// ── Reporte de pólizas ──────────────────────────────────────
export interface ReportKpis {
  totalPolizas?: number
  montoTotal?: number
  primaTotal?: number
  comisionTotal?: number
  [k: string]: number | undefined
}

// ── Comisiones ──────────────────────────────────────────────
export interface ComisionTotales {
  totalGenerado?: number
  totalPagado?: number
  totalPendiente?: number
  [k: string]: number | undefined
}

export interface ComisionTransaccion {
  id: number | string
  monto?: number
  estado?: string
  fecha?: string
  numeroOrden?: string
  producto?: string
  [k: string]: unknown
}
