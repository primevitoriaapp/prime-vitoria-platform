import { timingSafeEqual } from "node:crypto";

/**
 * `Authorization: Bearer` igual ao segredo (ex.: variavel de ambiente lida pelo caller).
 * Comparacao em tempo constante. Se `secretRaw` vazio/undefined, retorna false.
 */
export function isMachineBearerAuthorized(request: Request, secretRaw: string | undefined): boolean {
  const secret = secretRaw?.trim();
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!bearer || bearer.length !== secret.length) return false;

  try {
    return timingSafeEqual(Buffer.from(bearer, "utf8"), Buffer.from(secret, "utf8"));
  } catch {
    return false;
  }
}
