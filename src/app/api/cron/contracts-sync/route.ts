import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { isCronSecretAuthorized } from "@/lib/security/cron-auth";
import { syncPending, type ContractRow } from "@/lib/contracts/contracts";
import { maybeAutoApproveQuote } from "@/lib/contracts/quote-contract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Chave guardada no banco (o agendador do Supabase manda a mesma). */
async function dbCronKeyOk(request: Request): Promise<boolean> {
  const got = request.headers.get("x-prime-cron")?.trim() ?? "";
  if (got.length < 20) return false;
  const { data } = await db.from("app_secrets").select("value").eq("key", "cron_late_departure").maybeSingle();
  const want = String((data?.value as { token?: string } | null)?.token ?? "");
  if (want.length < 20 || want.length !== got.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

async function handle(request: Request) {
  if (!isCronSecretAuthorized(request) && !(await dbCronKeyOk(request))) {
    return fail("UNAUTHORIZED", "Cron não autorizado", 401);
  }
  try {
    // Contratos pendentes na ZapSign: atualiza a situação; assinou + sinal pago → orçamento confirmado.
    const { data } = await db.from("contracts").select("*").eq("status", "pendente").not("zapsign_token", "is", null).limit(50);
    const rows = await syncPending((data ?? []).map((r) => ({ ...(r as ContractRow), synced_at: null })));
    let approved = 0;
    for (const r of rows) {
      const q = (r as ContractRow & { quote_id?: string | null }).quote_id;
      if (r.status === "assinado" && q) if ((await maybeAutoApproveQuote(r.tenant_id, q).catch(() => ({ approved: false }))).approved) approved += 1;
    }
    return ok({ cron: "contracts-sync", checked: rows.length, signed: rows.filter((r) => r.status === "assinado").length, approved });
  } catch (error) {
    return fail("CRON_CONTRACTS_FAILED", error instanceof Error ? error.message : String(error), 500);
  }
}

export const GET = handle;
export const POST = handle;
