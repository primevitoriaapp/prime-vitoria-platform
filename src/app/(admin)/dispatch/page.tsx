import { DispatchAutomationSettings } from "@/components/dispatch-automation-settings";
import { OperationalQueuePanel } from "@/components/operational-queue-panel";
import { DispatchConsole } from "@/components/dispatch-console";
import { InAppNotificationsPanel } from "@/components/in-app-notifications-panel";
import { NotificationJobsPanel } from "@/components/notification-jobs-panel";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { TripTable } from "@/components/trip-table";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { fetchInternalApi } from "@/lib/server/internal-fetch";
import { getSessionContext } from "@/lib/server/session";

async function getTrips() {
  const response = await fetchInternalApi("/api/trips?page=1&pageSize=50");
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.data.items;
}

export default async function DispatchPage() {
  const session = await getSessionContext();
  const realtimeTenantId =
    session.role === "guest" || session.userId === "anonymous" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);
  const trips = await getTrips();

  return (
    <main>
      <OperationalRealtimeBridge tenantId={realtimeTenantId} />
      <h1>Central de despacho</h1>
      <p className="mb-4 max-w-3xl text-sm text-slate-600">
        Aprovação, despacho direcionado, ofertas a motoristas e reatribuição. A tabela abaixo atualiza em tempo real
        (Supabase Realtime) para o tenant da sessão.
      </p>
      <TripTable trips={trips} />
      <OperationalQueuePanel
        tenantId={realtimeTenantId}
        devFallbackRole={session.role === "admin" ? "admin" : "operador"}
      />
      <InAppNotificationsPanel
        tenantId={realtimeTenantId}
        devFallbackRole={session.role === "admin" ? "admin" : "operador"}
        compact
      />
      <div className="mt-6">
        <DispatchAutomationSettings />
      </div>
      <NotificationJobsPanel tenantId={realtimeTenantId} />
      <div className="card mt-6">
        <p className="text-sm text-slate-700">Endpoints de referência:</p>
        <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
          <li>POST /api/trips/:id/approve</li>
          <li>POST /api/trips/:id/dispatch-directed</li>
          <li>POST /api/dispatch/offers</li>
          <li>POST /api/dispatch/offers/:offerId/approve</li>
          <li>POST /api/trips/:id/reassign</li>
          <li>PUT /api/tenant/dispatch-settings (oferta ou despacho direto automático)</li>
          <li>POST /api/jobs/dispatch-direct-scan (operador ou Bearer DISPATCH_DIRECT_SCAN_SECRET)</li>
          <li>GET /api/trips com query scheduledFrom e scheduledTo (ISO, agenda)</li>
          <li>GET/POST/DELETE /api/trips/:id/operational-claim (multiatendimento)</li>
          <li>GET /api/trips/:id/operational-timeline (auditoria + notas internas)</li>
          <li>GET/POST /api/trips/:id/operator-notes (admin/operador)</li>
        </ul>
      </div>
      <h2 className="mt-8 font-semibold">Ações rápidas</h2>
      <DispatchConsole />
    </main>
  );
}
