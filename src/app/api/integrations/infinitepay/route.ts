import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { insertAuditEvent } from "@/lib/server/audit-log";

/** InfiniteTag + chave da API da InfinitePay: guardadas no banco; o painel só mostra o final da chave. */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const { data } = await db.from("app_secrets").select("value").eq("key", "infinitepay").maybeSingle();
    const v = (data?.value ?? {}) as { handle?: string; api_key?: string };
    const key = String(v.api_key ?? "");
    return ok({ handle: v.handle ?? null, configured: Boolean(v.handle) && key.length > 10, key_tail: key ? key.slice(-4) : null });
  } catch (e) {
    return mapApiError(e);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
    const body = z
      .object({
        handle: z.string().trim().min(2).max(60),
        api_key: z.string().trim().max(300).optional()
      })
      .parse(await request.json());
    const handle = body.handle.replace(/^[$@]/, "").trim();
    if (!/^[a-z0-9_.-]+$/i.test(handle))
      return fail(
        "HANDLE_INVALID",
        `“${body.handle}” não é uma InfiniteTag. A InfiniteTag é o seu @ na InfinitePay (no app, no seu perfil, com $ na frente — ex.: $primevitoria), sem espaços. Não é o nome que você deu à chave.`,
        400
      );
    const { data: cur } = await db.from("app_secrets").select("value").eq("key", "infinitepay").maybeSingle();
    const old = (cur?.value ?? {}) as { api_key?: string };
    const api_key = body.api_key && body.api_key.length > 10 ? body.api_key : old.api_key;
    if (body.api_key && !body.api_key.startsWith("inchk_")) return fail("KEY_INVALID", "A chave da InfinitePay começa com inchk_. Confira se copiou inteira.", 400);
    if (!api_key) return fail("KEY_MISSING", "Cole também a chave da API (começa com inchk_).", 400);
    const { error } = await db.from("app_secrets").upsert({ key: "infinitepay", value: { handle, api_key } }, { onConflict: "key" });
    if (error) return fail("SAVE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId: session.tenantId as string, actorUserId: session.userId, action: "integration.infinitepay", entityType: "integration", entityId: null, metadata: { handle }, request });
    return ok({ handle, configured: true, key_tail: api_key.slice(-4) });
  } catch (e) {
    return mapApiError(e);
  }
}
