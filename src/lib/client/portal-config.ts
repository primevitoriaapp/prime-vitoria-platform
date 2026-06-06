export type ClientPortalReadOnlyOptions = {
  /** Quando definido na ficha do cliente, prevalece sobre a env global. */
  portalRequestsEnabled?: boolean | null;
};

/**
 * Portal corporativo em modo consulta (só leitura) por defeito.
 * Por cliente: `portal_requests_enabled=true` activa solicitações/cancelamento.
 * Global: `NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY=false` activa todos sem flag por cliente.
 */
export function isClientPortalReadOnly(options?: ClientPortalReadOnlyOptions): boolean {
  if (options?.portalRequestsEnabled === true) return false;
  if (options?.portalRequestsEnabled === false) return true;

  const raw = process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return true;
}
