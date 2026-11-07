import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { insertAuditEvent } from "@/lib/server/audit-log";

/** Token da API da ZapSign: guardado no banco; o painel só mostra se está configurado (nunca o valor). */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const { data } = await db.from("app_secrets").select("value, created_at").eq("key", "zapsign").maybeSingle();
    const token = String((data?.value as { token?: string } | null)?.token ?? "");
    return ok({ configured: token.length > 10, tail: token ? token.slice(-4) : null, updated_at: (data as { created_at?: string } | null)?.created_at ?? null });
  } catch (e) {
    return mapApiError(e);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const { token } = z.object({ token: z.string().trim().min(10).max(300) }).parse(await request.json());
    // Testa o token na ZapSign antes de salvar.
    const res = await fetch("https://api.zapsign.com.br/api/v1/docs/?page=1", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!res || res.status === 401 || res.status === 403) return fail("ZAPSIGN_TOKEN_INVALID", "A ZapSign recusou esse token. Confira se copiou o token inteiro (Configurações › Integração › API).", 400);
    const { error } = await db.from("app_secrets").upsert({ key: "zapsign", value: { token } }, { onConflict: "key" });
    if (error) return fail("SAVE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId: session.tenantId as string, actorUserId: session.userId, action: "integration.zapsign_token", entityType: "integration", entityId: null, metadata: { ok: res.ok }, request });
    return ok({ configured: true, tail: token.slice(-4) });
  } catch (e) {
    return mapApiError(e);
  }
}
