import Link from "next/link";
import type { Route } from "next";
import { AdminPageHeader } from "@/components/admin-page-header";
import { OperationsReportExport } from "@/components/operations-report-export";
import { DashboardOverview } from "@/components/dashboard-overview";
import { TripsToReviewAlert } from "@/components/trip-review-banner";
import { can } from "@/lib/security/rbac";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { getSessionContext } from "@/lib/server/session";

export default async function DashboardPage() {
  const session = await getSessionContext();
  const realtimeTenantId =
    session.role === "guest" || session.userId === "anonymous" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);
  const showMoney = session.role === "admin" || can(session, "finance.read");

  return (
    <>
      <AdminPageHeader title="Visão geral" subtitle="Como está a operação agora e no período escolhido" />
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Atalhos">
        <Link href={"/agenda?nova=1" as Route} className="btn-primary">
          + Agendar corrida
        </Link>
        {[
          ["/orcamentos", "Orçamentos"],
          ["/agenda", "Agenda"],
          ["/ao-vivo", "Motoristas ao vivo"],
          ["/clients/relatorio", "Relatório por cliente"],
          ["/finance", "Faturas"]
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href as Route}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium ring-1 ring-prime-border hover:ring-prime-gold"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mb-5 empty:hidden">
        <TripsToReviewAlert />
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
