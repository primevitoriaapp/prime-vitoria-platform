/**
 * Rotas do painel (pasta src/app/(admin)): usam o shell próprio (menu lateral + barra de baixo no celular),
 * então o cabeçalho antigo do site NÃO pode aparecer nelas — senão a página fica mais alta que a tela
 * e o fim dela some atrás da barra do celular. Teste em tests/backoffice-paths.test.ts garante que
 * toda pasta nova do painel está aqui.
 */
export const BACKOFFICE_PATH_PREFIXES = [
  "/agenda",
  "/agendamentos",
  "/ao-vivo",
  "/arquivo",
  "/audit",
  "/categorias",
  "/clients",
  "/conciliacao",
  "/conferencia",
  "/configuracoes",
  "/contabilidade",
  "/contas-a-pagar",
  "/dashboard",
  "/dispatch",
  "/drivers",
  "/finance",
  "/importar",
  "/integracoes",
  "/orcamentos",
  "/painel-financeiro",
  "/parceiros",
  "/repasses",
  "/users",
  "/vehicles",
  "/whatsapp"
] as const;

export function isBackofficePath(pathname: string): boolean {
  return BACKOFFICE_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
