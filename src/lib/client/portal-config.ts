/**
 * Fase segura do portal cliente: só leitura por defeito.
 * Defina NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY=false para activar solicitações/cancelamento.
 */
export function isClientPortalReadOnly(): boolean {
  const raw = process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return true;
}
