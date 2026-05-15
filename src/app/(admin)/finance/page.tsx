import { DriverPayablesPanel } from "@/components/driver-payables-panel";
import { FinancialClosingsPanel } from "@/components/financial-closings-panel";
import { FinanceConsole } from "@/components/finance-console";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { ReceivablesPanel } from "@/components/receivables-panel";
import { ErpWebhookInboxPanel } from "@/components/erp-webhook-inbox-panel";
import { InAppNotificationsPanel } from "@/components/in-app-notifications-panel";
import { ReconciliationIssuesPanel } from "@/components/reconciliation-issues-panel";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { getSessionContext } from "@/lib/server/session";

export default async function FinancePage() {
  const session = await getSessionContext();
  const realtimeTenantId =
    session.role === "guest" || session.userId === "anonymous" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);

  return (
    <main>
      <OperationalRealtimeBridge tenantId={realtimeTenantId} />
      <h1>Financeiro</h1>
      <div className="card">Contas a receber, contas a pagar, margem operacional e fechamento mensal.</div>
      <FinanceConsole />
      {session.role === "admin" || session.role === "financeiro" ? (
        <InAppNotificationsPanel
          tenantId={realtimeTenantId}
          devFallbackRole={session.role === "financeiro" ? "financeiro" : "admin"}
        />
      ) : null}
      <ReceivablesPanel
        tenantId={realtimeTenantId}
        devFallbackRole={session.role === "operador" ? "operador" : "financeiro"}
      />
      {session.role === "admin" || session.role === "financeiro" ? (
        <>
          <DriverPayablesPanel
            tenantId={realtimeTenantId}
            devFallbackRole={session.role === "financeiro" ? "financeiro" : "admin"}
          />
          <FinancialClosingsPanel
            tenantId={realtimeTenantId}
            devFallbackRole={session.role === "financeiro" ? "financeiro" : "admin"}
          />
        </>
      ) : null}
      <ReconciliationIssuesPanel
        tenantId={realtimeTenantId}
        devFallbackRole={session.role === "operador" ? "operador" : "financeiro"}
      />
      {session.role === "admin" || session.role === "financeiro" ? (
        <ErpWebhookInboxPanel
          tenantId={realtimeTenantId}
          devFallbackRole={session.role === "financeiro" ? "financeiro" : "admin"}
        />
      ) : null}
    </main>
  );
}
