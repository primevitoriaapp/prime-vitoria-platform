import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability, can } from "@/lib/security/rbac";
import { clientIdsOfCompany, companyFromRequest } from "@/lib/company/company-scope-server";
import { buildSeries, dashRanges, pctChange, seriesRange, summarize, topBy, type DashPeriod, type MetricTrip } from "@/lib/operations/dashboard-metrics";

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

const showMoneyFor = (session: Awaited<ReturnType<typeof getSessionContext>>) => can(session, "finance.read") || session.role === "admin";

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.read");
    const tenantId = assertTenantScope(session);
    const p = new URL(request.url).searchParams.get("period") as DashPeriod | null;
    const period: DashPeriod = p && PERIODS.includes(p) ? p : "hoje";
    if (!PERIODS.includes(period)) return fail("INVALID_PERIOD", "Período inválido.", 400);
    const r = dashRanges(period);
    const empresa = companyFromRequest(request);
    const only = await clientIdsOfCompany(tenantId, empresa);
    const inScope = <T extends { client_id?: string | null }>(xs: T[]) => (only ? xs.filter((t) => t.client_id && only.has(t.client_id)) : xs);

    const now = new Date();
    const in24h = new Date(now.getTime() + 72 * 3600000).toISOString(); // regra da Prime: motorista definido até 3 dias antes
    const in30d = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

    const staleIso = new Date(now.getTime() - 12 * 3600000).toISOString();
    const [curr, prev, noDriver, pending, drivers, clients, cnh, stale, expenses, vdocs, lowRatings] = await Promise.all([
      tripsBetween(tenantId, r.from, r.to),
      tripsBetween(tenantId, r.prevFrom, r.prevTo).then(inScope),
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
      db.from("clients").select("id, name, trade_name, billing_issuer").eq("tenant_id", tenantId),
      db
        .from("drivers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .lte("cnh_expires_at", in30d),
      // Corrida que já passou há mais de 12 h e ninguém finalizou (motorista esqueceu de fechar).
      db
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("operational_status", ["dispatched", "accepted", "on_the_way", "arrived", "in_progress"])
        .lt("scheduled_at", staleIso),
      db.from("trip_expenses").select("trip_id").eq("tenant_id", tenantId).eq("status", "pendente").limit(50),
      db
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .or(`insurance_expires_at.lte.${in30d},licensing_expires_at.lte.${in30d},inspection_expires_at.lte.${in30d}`),
      db
        .from("trip_ratings")
        .select("trip_id")
        .eq("tenant_id", tenantId)
        .lte("stars", 3)
        .gte("created_at", new Date(now.getTime() - 7 * 86400000).toISOString())
        .limit(20)
    ]);

    // Corridas de clientes sem empresa faturadora: somem quando uma empresa está escolhida no topo.
    const issuerOf = new Map((clients.data ?? []).map((c) => [c.id as string, (c.billing_issuer as string | null) ?? null]));
    const currAll = curr;
    const orphanTrips = currAll.filter((t) => t.client_id && !issuerOf.get(t.client_id));
    const orphanClients = new Set(orphanTrips.map((t) => t.client_id as string));
    const currScoped = inScope(currAll);

    const { count: driverReqs } = await db
      .from("driver_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pendente");

    let payablesOverdue = 0;
    if (session.role === "admin" || session.role === "financeiro") {
      const todaySp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
      let pq = db
        .from("company_payables")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "aberta")
        .lt("due_date", todaySp);
      if (empresa !== "todas") pq = pq.eq("issuer", empresa);
      const { count } = await pq;
      payablesOverdue = count ?? 0;
    }

    const sr = seriesRange(period, now);
    const seriesTrips = sr.from === r.from && sr.to === r.to ? currScoped : await tripsBetween(tenantId, sr.from, sr.to).then(inScope);
    const series = buildSeries(seriesTrips, period, now);

    const s = summarize(currScoped);
    const ps = summarize(prev);
    const showMoney = can(session, "finance.read") || session.role === "admin";
    const driverName = new Map((drivers.data ?? []).map((d) => [d.id as string, (d.full_name as string) ?? "Motorista"]));
    const clientName = new Map(
      (clients.data ?? []).map((c) => [c.id as string, ((c.trade_name as string) || (c.name as string)) ?? "Cliente"])
    );

    const alerts: { tone: "red" | "amber" | "blue"; text: string; href: string }[] = [];
    if ((pending.count ?? 0) > 0)
      alerts.push({ tone: "blue", text: `${pending.count} pedido(s) novo(s) esperando confirmação`, href: "/agenda?grupo=agendada&periodo=mes" });
    if ((driverReqs ?? 0) > 0)
      alerts.push({ tone: "amber", text: `${driverReqs} pedido(s) de motorista para aprovar (dados, foto, CNH, carro ou PIX)`, href: "/drivers#pedidos" });
    if ((noDriver.count ?? 0) > 0)
      alerts.push({ tone: "red", text: `${noDriver.count} corrida(s) nos próximos 3 dias sem motorista`, href: "/agenda?grupo=agendada&periodo=semana" });
    if ((stale.count ?? 0) > 0)
      alerts.push({ tone: "red", text: `${stale.count} corrida(s) que já passaram e não foram finalizadas`, href: "/agenda#esquecidas" });
    if ((expenses.data ?? []).length > 0)
      alerts.push({
        tone: "amber",
        text: `${(expenses.data ?? []).length} despesa(s) de motorista (pedágio/estacionamento) para aprovar`,
        href: `/agenda?trip=${(expenses.data ?? [])[0].trip_id}#trip-detail`
      });
    if (s.completedNoValue > 0)
      alerts.push({ tone: "amber", text: `${s.completedNoValue} corrida(s) finalizada(s) sem valor no período`, href: "/agenda?grupo=finalizada&periodo=mes" });
    if (payablesOverdue > 0)
      alerts.push({ tone: "red", text: `${payablesOverdue} conta(s) da empresa vencida(s)`, href: "/contas-a-pagar" });
    if ((lowRatings.data ?? []).length > 0)
      alerts.push({
        tone: "amber",
        text: `${(lowRatings.data ?? []).length} avaliação(ões) baixa(s) de passageiro nos últimos 7 dias`,
        href: `/agenda?trip=${(lowRatings.data ?? [])[0].trip_id}#trip-detail`
      });
    if ((vdocs.count ?? 0) > 0)
      alerts.push({ tone: "amber", text: `${vdocs.count} veículo(s) com seguro, licenciamento ou vistoria vencido/vencendo em 30 dias`, href: "/vehicles" });
    if ((cnh.count ?? 0) > 0)
      alerts.push({ tone: "amber", text: `${cnh.count} motorista(s) com CNH vencida ou vencendo em 30 dias`, href: "/drivers" });

    if (orphanTrips.length) {
      alerts.unshift({
        tone: "red",
        text:
          empresa !== "todas"
            ? `${orphanTrips.length} corrida(s) do período NÃO estão somadas aqui: ${orphanClients.size} cliente(s) sem empresa que fatura. Defina no cadastro do cliente ou escolha "Todas as empresas".`
            : `${orphanClients.size} cliente(s) com corridas no período ainda sem empresa que fatura (R J Prime, Prime Locadora ou Ilha Prime). Defina no cadastro para a fatura e os relatórios saírem certos.`,
        href: "/clients"
      });
    }

    return ok({
      period,
      empresa,
      range: r,
      summary: showMoney ? s : { ...s, revenue: null, payout: null, profit: null, avgTicket: null },
      change: {
        total: pctChange(s.total, ps.total),
        revenue: showMoney ? pctChange(s.revenue, ps.revenue) : null,
        profit: showMoney ? pctChange(s.profit, ps.profit) : null
      },
      previous: { total: ps.total, revenue: showMoney ? ps.revenue : null },
      activeDrivers: (drivers.data ?? []).filter((d) => d.active !== false).length,
      topClients: topBy(currScoped, "client_id").map((x) => ({ ...x, name: clientName.get(x.id) ?? "Cliente", revenue: showMoney ? x.revenue : null })),
      topDrivers: topBy(currScoped, "driver_id").map((x) => ({ ...x, name: driverName.get(x.id) ?? "Motorista", revenue: null })),
      alerts,
      series: showMoneyFor(session) ? series : series.map((p) => ({ ...p, revenue: 0, profit: 0 }))
    });
  } catch (error) {
    return mapApiError(error);
  }
}
