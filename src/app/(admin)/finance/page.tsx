import { AdminPageHeader } from "@/components/admin-page-header";
import { DriverPayablesPanel } from "@/components/driver-payables-panel";
import { FinancialClosingsPanel } from "@/components/financial-closings-panel";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { ReceivablesPanel } from "@/components/receivables-panel";
import { ClientInvoicesAdminPanel } from "@/components/client-invoices-admin-panel";
import { ErpWebhookInboxPanel } from "@/components/erp-webhook-inbox-panel";
import { ReconciliationIssuesPanel } from "@/components/reconciliation-issues-panel";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { getSessionContext } from "@/lib/server/session";

export default async function FinancePage() {
  const session = await getSessionContext();
  const realtimeTenantId =
    session.role === "guest" || session.userId === "anonymous" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);

  return (
    <>
      <OperationalRealtimeBridge tenantId={realtimeTenantId} />
      <AdminPageHeader
        title="Financeiro"
        subtitle="Faturas dos clientes, recebimentos e repasses aos motoristas"
      />
      {session.role === "admin" || session.role === "financeiro" ? (
        <ClientInvoicesAdminPanel devFallbackRole={session.role === "financeiro" ? "financeiro" : "admin"} />
      ) : null}
      <div id="recebiveis" className="scroll-mt-6" />
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
    </>
  );
}
