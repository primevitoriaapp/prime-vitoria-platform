import { DispatchAutomationSettings } from "@/components/dispatch-automation-settings";
import { OperationalHistoryPanel } from "@/components/operational-history-panel";
import { OperationalQueuePanel } from "@/components/operational-queue-panel";
import { DispatchConsole } from "@/components/dispatch-console";
import { InAppNotificationsPanel } from "@/components/in-app-notifications-panel";
import { NotificationJobsPanel } from "@/components/notification-jobs-panel";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { TripTable } from "@/components/trip-table";
import { StagingSmokeHints } from "@/components/staging-smoke-hints";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { fetchInternalApi } from "@/lib/server/internal-fetch";
import { getSessionContext } from "@/lib/server/session";
import { buildAgendaTripHref } from "@/lib/operations/agenda-trip-href";

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
      <StagingSmokeHints variant="light" />
      <TripTable
        trips={trips}
        operatorNotesHref={(id) => {
          const trip = trips.find((t: { id: string; scheduled_at: string }) => t.id === id);
          return trip ? buildAgendaTripHref(id, trip.scheduled_at) : `/agenda?trip=${id}`;
        }}
      />
      <OperationalQueuePanel
        tenantId={realtimeTenantId}
        devFallbackRole={session.role === "admin" ? "admin" : "operador"}
      />
      <OperationalHistoryPanel devFallbackRole={session.role === "admin" ? "admin" : "operador"} />
      <InAppNotificationsPanel
        tenantId={realtimeTenantId}
        devFallbackRole={session.role === "admin" ? "admin" : "operador"}
        compact
      />
      <div className="mt-6">
        <DispatchAutomationSettings />
      </div>
      <NotificationJobsPanel tenantId={realtimeTenantId} />
      <details className="card mt-6">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Ferramentas avançadas (API / UUID)
        </summary>
        <p className="mt-3 text-sm text-slate-600">
          Para operação diária use a <strong>Agenda</strong> (Abrir viagem). Esta secção é para testes técnicos.
        </p>
        <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
          <li>POST /api/trips/:id/approve</li>
          <li>POST /api/trips/:id/dispatch-directed</li>
          <li>POST /api/dispatch/offers</li>
          <li>POST /api/dispatch/offers/:offerId/approve</li>
          <li>POST /api/trips/:id/reassign</li>
          <li>PUT /api/tenant/dispatch-settings</li>
          <li>POST /api/jobs/dispatch-direct-scan</li>
          <li>GET /api/trips?scheduledFrom&amp;scheduledTo</li>
          <li>GET/POST/DELETE /api/trips/:id/operational-claim</li>
        </ul>
        <h3 className="mt-6 font-semibold text-slate-800">Console UUID</h3>
        <DispatchConsole />
      </details>
    </main>
  );
}
