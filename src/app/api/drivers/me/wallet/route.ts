import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { summarizeDriverEarnings } from "@/lib/drivers/driver-earnings";

/** Carteira do motorista parceiro: resumo + próximos recebimentos e o que já recebeu. */
export async function GET() {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    if (session.role !== "motorista" || !session.driverId) return fail("FORBIDDEN", "Apenas motoristas", 403);
    const tenantId = assertTenantScope(session);
    const { data: driver } = await db.from("drivers").select("employment_type, pix_key").eq("id", session.driverId).maybeSingle();
    if (driver?.employment_type === "funcionario") return ok({ funcionario: true });

    const since = new Date(Date.now() - 120 * 86400_000).toISOString();
    const [{ data: trips }, { data: payables }] = await Promise.all([
      db.from("trips").select("id, scheduled_at, driver_amount, operational_status, origin_text, destination_text, client_invoice_id").eq("tenant_id", tenantId).eq("driver_id", session.driverId).gte("scheduled_at", since).limit(2000),
      db.from("driver_payables").select("id, amount, status, trip_id, due_date, paid_at").eq("tenant_id", tenantId).eq("driver_id", session.driverId).neq("status", "cancelled").order("due_date").limit(2000)
    ]);
    const tripById = new Map((trips ?? []).map((t) => [t.id as string, t]));
    const tripIds = (payables ?? []).map((p) => p.trip_id).filter(Boolean) as string[];
    const missing = tripIds.filter((id) => !tripById.has(id));
    if (missing.length) {
      const { data: more } = await db.from("trips").select("id, scheduled_at, origin_text, destination_text, client_invoice_id").in("id", missing.slice(0, 500));
      for (const t of more ?? []) tripById.set(t.id as string, t as never);
    }
    const { data: recs } = tripIds.length ? await db.from("accounts_receivable").select("trip_id, status").in("trip_id", tripIds) : { data: [] as { trip_id: string; status: string }[] };
    const invIds = [...new Set([...tripById.values()].map((t) => t.client_invoice_id as string).filter(Boolean))];
    const { data: invs } = invIds.length ? await db.from("client_invoices").select("id, status").in("id", invIds) : { data: [] as { id: string; status: string }[] };
    const invPaid = new Set((invs ?? []).filter((i) => i.status === "paga").map((i) => i.id as string));
    const recByTrip = new Map((recs ?? []).map((r) => [r.trip_id as string, r.status as string]));
    const short = (a: unknown) => String(a ?? "—").split(",")[0];

    const items = (payables ?? []).map((p) => {
      const t = tripById.get(p.trip_id as string);
      const released = recByTrip.get(p.trip_id as string) === "paid" || (t?.client_invoice_id ? invPaid.has(t.client_invoice_id as string) : false);
      return {
        id: p.id as string,
        amount: Number(p.amount) || 0,
        trip_at: (t?.scheduled_at as string) ?? null,
        route: t ? `${short(t.origin_text)} → ${short(t.destination_text)}` : "Corrida",
        stage: p.status === "paid" ? "pago" : released ? "liberado" : "aguardando",
        due_date: (p.due_date as string) ?? null,
        paid_at: (p.paid_at as string) ?? null
      };
    });

    const summary = summarizeDriverEarnings(
      (trips ?? []) as { scheduled_at: string; driver_amount: number | null; operational_status: string }[],
      (payables ?? []).map((p) => ({ amount: p.amount as number, status: p.status as string, receivable_status: recByTrip.get(p.trip_id as string) ?? null }))
    );
    return ok({ funcionario: false, pix_key: driver?.pix_key ?? null, summary, items });
  } catch (error) {
    return mapApiError(error);
  }
}
