/**
 * Productos habilitados por entorno. Espeja los flags del portal web
 * (`environment.atualcanceHabilitado`): en PROD A Tu Alcance se lanza como
 * «Próximamente» hasta que el negocio lo active; en QA está activo.
 * Las Inspecciones de Seguro de Auto no dependen de este flag (como en la web).
 */
export const ATUALCANCE_HABILITADO =
  String(process.env.EXPO_PUBLIC_ATUALCANCE_HABILITADO ?? 'true').toLowerCase() === 'true'
