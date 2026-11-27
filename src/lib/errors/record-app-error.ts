/** Erros que não são problema do sistema (versão antiga aberta, internet caiu, extensões do navegador). */
export function isNoiseError(message: string): boolean {
  return /ChunkLoadError|Loading chunk|dynamically imported module|Failed to find Server Action|ResizeObserver loop|Failed to fetch|Load failed|NetworkError|network error|AbortError|The user aborted|cancelled|Script error\.?$|NEXT_REDIRECT|NEXT_NOT_FOUND/i.test(
    message
  );
}

/** Grava um erro (sem travar quem chamou). Só servidor. */
export async function recordAppError(e: { source: "tela" | "servidor"; message: string; path?: string | null; code?: string | null; digest?: string | null; userAgent?: string | null; role?: string | null }): Promise<void> {
  const message = String(e.message ?? "").trim().slice(0, 600);
  if (!message || isNoiseError(message)) return;
  try {
    const { db } = await import("@/lib/server/db");
    // No máximo 1 registro igual por minuto (um erro em loop não enche a tabela).
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await db.from("app_errors").select("id", { count: "exact", head: true }).eq("message", message).gte("created_at", since);
    if ((count ?? 0) > 0) return;
    await db.from("app_errors").insert({
      source: e.source,
      message,
      path: e.path?.slice(0, 300) ?? null,
      code: e.code?.slice(0, 80) ?? null,
      digest: e.digest?.slice(0, 80) ?? null,
      user_agent: e.userAgent?.slice(0, 300) ?? null,
      role: e.role?.slice(0, 30) ?? null
    });
  } catch {
    /* nunca derruba a requisição por causa do registro */
  }
}
