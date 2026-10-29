import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability, can } from "@/lib/security/rbac";
import { dashRanges, pctChange, summarize, topBy, type DashPeriod, type MetricTrip } from "@/lib/operations/dashboard-metrics";

const PERIODS: DashPeriod[] = ["hoje", "7d", "mes", "ano"];

async function tripsBetween(tenantId: string, from: string, to: string) {
  const { data, error } = await db
    .from("trips")
    .select("id, operational_status, client_amount, driver_amount, client_id, driver_id, scheduled_at")
    .eq("tenant_id", tenantId)
    .gte("scheduled_at", from)
    .lt("scheduled_at", to)
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as (MetricTrip & { id: string; scheduled_at: string })[];
}

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.read");
    const tenantId = assertTenantScope(session);
    const p = new URL(request.url).searchParams.get("period") as DashPeriod | null;
    const period: DashPeriod = p && PERIODS.includes(p) ? p : "hoje";
    if (!PERIODS.includes(period)) return fail("INVALID_PERIOD", "Período inválido.", 400);
    const r = dashRanges(period);

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 3600000).toISOString();
    const in30d = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

    const [curr, prev, noDriver, pending, drivers, clients, cnh] = await Promise.all([
      tripsBetween(tenantId, r.from, r.to),
      tripsBetween(tenantId, r.prevFrom, r.prevTo),
      db
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("driver_id", null)
        .in("operational_status", ["requested", "approved"])
        .gte("scheduled_at", now.toISOString())
        .lt("scheduled_at", in24h),
      db
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("operational_status", "requested"),
      db.from("drivers").select("id, full_name, active").eq("tenant_id", tenantId),
      db.from("clients").select("id, name, trade_name").eq("tenant_id", tenantId),
      db
        .from("drivers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .lte("cnh_expires_at", in30d)
    ]);

    const s = summarize(curr);
    const ps = summarize(prev);
    const showMoney = can(session, "finance.read") || session.role === "admin";
    const driverName = new Map((drivers.data ?? []).map((d) => [d.id as string, (d.full_name as string) ?? "Motorista"]));
    const clientName = new Map(
      (clients.data ?? []).map((c) => [c.id as string, ((c.trade_name as string) || (c.name as string)) ?? "Cliente"])
    );

    const alerts: { tone: "red" | "amber" | "blue"; text: string; href: string }[] = [];
    if ((pending.count ?? 0) > 0)
      alerts.push({ tone: "blue", text: `${pending.count} pedido(s) novo(s) esperando confirmação`, href: "/agenda" });
    if ((noDriver.count ?? 0) > 0)
      alerts.push({ tone: "red", text: `${noDriver.count} corrida(s) nas próximas 24h sem motorista`, href: "/agenda" });
    if (s.completedNoValue > 0)
      alerts.push({ tone: "amber", text: `${s.completedNoValue} corrida(s) finalizada(s) sem valor no período`, href: "/agenda" });
    if ((cnh.count ?? 0) > 0)
      alerts.push({ tone: "amber", text: `${cnh.count} motorista(s) com CNH vencida ou vencendo em 30 dias`, href: "/drivers" });

    return ok({
      period,
      range: r,
      summary: showMoney ? s : { ...s, revenue: null, payout: null, profit: null, avgTicket: null },
      change: {
        total: pctChange(s.total, ps.total),
        revenue: showMoney ? pctChange(s.revenue, ps.revenue) : null,
        profit: showMoney ? pctChange(s.profit, ps.profit) : null
      },
      previous: { total: ps.total, revenue: showMoney ? ps.revenue : null },
      activeDrivers: (drivers.data ?? []).filter((d) => d.active !== false).length,
      topClients: topBy(curr, "client_id").map((x) => ({ ...x, name: clientName.get(x.id) ?? "Cliente", revenue: showMoney ? x.revenue : null })),
      topDrivers: topBy(curr, "driver_id").map((x) => ({ ...x, name: driverName.get(x.id) ?? "Motorista", revenue: null })),
      alerts
    });
  } catch (error) {
    return mapApiError(error);
  }
}
