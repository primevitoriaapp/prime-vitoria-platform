/** Rotas do backoffice que usam o shell escuro (sidebar Lovable). */
export const BACKOFFICE_PATH_PREFIXES = [
  "/dashboard",
  "/dispatch",
  "/agenda",
  "/clients",
  "/drivers",
  "/vehicles",
  "/finance",
  "/users",
  "/audit",
  "/configuracoes"
] as const;

export function isBackofficePath(pathname: string): boolean {
  return BACKOFFICE_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
