import Link from "next/link";
import type { Route } from "next";
import { resolveProfileNames } from "@/lib/profiles/resolve-profile-names";
import { OperationsReportExport } from "@/components/operations-report-export";
import { DashboardOverview } from "@/components/dashboard-overview";
import { TripsToReviewAlert } from "@/components/trip-review-banner";
import { DriversAlertsCard } from "@/components/drivers-alerts-card";
import { can } from "@/lib/security/rbac";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { getSessionContext } from "@/lib/server/session";

export default async function DashboardPage() {
  const session = await getSessionContext();
  const realtimeTenantId =
    session.role === "guest" || session.userId === "anonymous" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);
  const showMoney = session.role === "admin" || can(session, "finance.read");

  const names: Record<string, string> = session.userId && session.userId !== "anonymous" ? await resolveProfileNames([session.userId]).catch(() => ({} as Record<string, string>)) : {};
  const firstRaw = (names[session.userId] ?? "").trim().split(/\s+/)[0] ?? "";
  const first = /^(admin|administrador|operador|financeiro|staging)$/i.test(firstRaw) ? "" : firstRaw;
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const today = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-prime-text sm:text-[30px]">
            {hello}
            {first ? `, ${first}` : ""}
          </h1>
          <p className="mt-1 text-[15px] text-prime-muted">
            {today.charAt(0).toUpperCase() + today.slice(1)} · como está a operação
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Atalhos">
          {[
            ["/orcamentos", "Orçamentos"],
            ["/ao-vivo", "Ao vivo"],
            ["/clients/relatorio", "Relatório por cliente"]
          ].map(([href, label]) => (
            <Link key={href} href={href as Route} className="btn-outline hidden md:inline-flex">
              {label}
            </Link>
          ))}
          <Link href={"/agenda?nova=1" as Route} className="btn-primary inline-flex items-center gap-2">
            ＋ Agendar corrida
          </Link>
        </nav>
      </header>
      <div className="mb-5 empty:hidden">
        <TripsToReviewAlert />
        <DriversAlertsCard />
      </div>
      <DashboardOverview tenantId={realtimeTenantId} showMoney={showMoney} />


      {can(session, "report.read") ? (
        <div className="mt-8">
          <OperationsReportExport
            devFallbackRole={session.role === "financeiro" ? "financeiro" : session.role === "operador" ? "operador" : "admin"}
          />
        </div>
      ) : null}
    </>
  );
}
