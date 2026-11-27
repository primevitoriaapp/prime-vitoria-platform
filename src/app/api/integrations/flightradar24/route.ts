import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { FR24_BASE } from "@/lib/integrations/fr24";

/** Chave da API do Flightradar24 (acompanhamento de voos): guardada no banco; o painel só mostra o final. */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const { data } = await db.from("app_secrets").select("value, created_at").eq("key", "flightradar24").maybeSingle();
    const token = String((data?.value as { token?: string } | null)?.token ?? "");
    return ok({ configured: token.length >= 20, tail: token ? token.slice(-4) : null });
  } catch (e) {
    return mapApiError(e);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const { token } = z.object({ token: z.string().trim().min(20).max(600) }).parse(await request.json());
    // Testa a chave antes de salvar (consulta de uso: não gasta crédito de voo).
    const res = await fetch(`${FR24_BASE}/usage?period=24h`, {
      headers: { Accept: "application/json", "Accept-Version": "v1", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000)
    }).catch(() => null);
    if (!res) return fail("FR24_UNREACHABLE", "Não consegui falar com o Flightradar24 agora. Tente de novo em instantes.", 502);
    if (res.status === 401 || res.status === 403) return fail("FR24_TOKEN_INVALID", "O Flightradar24 recusou essa chave. Confira se copiou a chave inteira (Key management).", 400);
    const { error } = await db.from("app_secrets").upsert({ key: "flightradar24", value: { token } }, { onConflict: "key" });
    if (error) return fail("SAVE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId: session.tenantId as string, actorUserId: session.userId, action: "integration.flightradar24", entityType: "integration", entityId: null, metadata: { status: res.status }, request });
    return ok({ configured: true, tail: token.slice(-4) });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("INVALID_BODY", "Chave muito curta. Copie a chave inteira.", 400);
    return mapApiError(e);
  }
}
