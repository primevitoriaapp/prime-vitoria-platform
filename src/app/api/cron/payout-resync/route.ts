import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { isCronSecretAuthorized } from "@/lib/security/cron-auth";
import { resyncOpenDriverPayoutDates } from "@/lib/finance/driver-payout-sync";

import { ensureDriverPayableFromTripFinancials } from "@/lib/finance/ensure-driver-payable";
import { ensureAccountsReceivableFromTripFinancials } from "@/lib/finance/ensure-accounts-receivable";

/** Corridas concluídas com valor e sem lançamento (ex.: valor posto à mão depois): cria financeiro, a-pagar e a-receber. */
async function healMissingPayables(): Promise<number> {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: trips } = await db
    .from("trips")
    .select("id, tenant_id, client_amount, driver_amount, margin")
    .eq("operational_status", "completed")
    .gt("driver_amount", 0)
    .gte("scheduled_at", since)
    .limit(1000);
  if (!trips?.length) return 0;
  const ids = trips.map((t) => t.id as string);
  const { data: pays } = await db.from("driver_payables").select("trip_id").in("trip_id", ids);
  const has = new Set((pays ?? []).map((p) => p.trip_id as string));
  let n = 0;
  for (const t of trips) {
    if (has.has(t.id as string)) continue;
    const { data: tf } = await db.from("trip_financials").select("trip_id").eq("trip_id", t.id).maybeSingle();
    if (!tf) {
      const client = Number(t.client_amount ?? 0) || 0;
      const driver = Number(t.driver_amount ?? 0) || 0;
      await db.from("trip_financials").insert({ trip_id: t.id, amount_client: client, amount_driver: driver, net_margin: Math.round((client - driver) * 100) / 100 });
    }
    const r = await ensureDriverPayableFromTripFinancials(t.id as string, t.tenant_id as string).catch(() => ({ created: false }));
    await ensureAccountsReceivableFromTripFinancials(t.id as string, t.tenant_id as string).catch(() => undefined);
    if (r.created) n += 1;
  }
  return n;
}

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
    // Datas de repasse em aberto (vencimento da fatura + compensação bancária em dias úteis).
    const { data: tenants } = await db.from("tenants").select("id");
    // Primeiro cria o que faltou, depois acerta as datas.
    const healed = await healMissingPayables();
    let changed = 0;
    for (const t of tenants ?? []) changed += await resyncOpenDriverPayoutDates(t.id as string);
    return ok({ cron: "payout-resync", changed, healed });
  } catch (error) {
    return fail("CRON_PAYOUT_FAILED", error instanceof Error ? error.message : String(error), 500);
  }
}

export const GET = handle;
export const POST = handle;
