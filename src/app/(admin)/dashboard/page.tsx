import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { LiveMap } from "@/components/live-map";
import { OperationsReportExport } from "@/components/operations-report-export";
import { DashboardOverview } from "@/components/dashboard-overview";
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
      <DashboardOverview tenantId={realtimeTenantId} showMoney={showMoney} />

      <div className="mb-3 mt-8 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Motoristas agora</h2>
        <Link href="/ao-vivo" className="text-sm font-medium text-prime-gold hover:underline">
          Abrir em tela cheia →
        </Link>
      </div>
      <LiveMap tenantId={realtimeTenantId} />

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
