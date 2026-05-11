/**
 * Em `production`, cabecalhos `x-role` / `x-user-id` so sao aceitos como sessao
 * quando `TRUST_HEADER_AUTH=true` (bootstrap explicito). Fora disso, use JWT.
 */
export function trustHeaderAuth(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.TRUST_HEADER_AUTH === "true") return true;
  return env.NODE_ENV !== "production";
}
