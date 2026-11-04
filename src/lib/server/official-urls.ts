/**
 * Endereços oficiais do sistema (no ar desde 03/11/2026).
 * central = painel da Prime; motorista = app do motorista; empresa = portal do cliente.
 * Os caminhos funcionam em qualquer um deles; o endereço só deixa o link com a cara certa.
 */
export const OFFICIAL_URLS = {
  central: "https://central.primevitoria.com",
  motorista: "https://motorista.primevitoria.com",
  empresa: "https://empresa.primevitoria.com"
} as const;

export type OfficialArea = keyof typeof OFFICIAL_URLS;

export function officialUrl(area: OfficialArea, path = ""): string {
  return `${OFFICIAL_URLS[area]}${path}`;
}
