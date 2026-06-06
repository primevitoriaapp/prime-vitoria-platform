import { z } from "zod";
import { AdminPageHeader } from "@/components/admin-page-header";
import { BackButton } from "@/components/back-button";
import { AgendaDateRangeForm } from "@/components/agenda-date-range-form";
import { OperationalHistoryPanel } from "@/components/operational-history-panel";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { InAppNotificationsPanel } from "@/components/in-app-notifications-panel";
import { TripAgendaFocusPanel } from "@/components/trip-agenda-focus-panel";
import { AgendaTripsList } from "@/components/agenda-trips-list";
import { StagingSmokeHints } from "@/components/staging-smoke-hints";
import { OperadorTripCreatePanel } from "@/components/operador-trip-create-panel";
import { TripFocusHeader } from "@/components/trip-focus-header";
import { defaultAgendaRangeIso } from "@/lib/operations/agenda-default-range";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { fetchInternalApi } from "@/lib/server/internal-fetch";
import { getSessionContext } from "@/lib/server/session";

function defaultRangeUtc(): { fromIso: string; toIso: string } {
  return defaultAgendaRangeIso();
}

async function getTrips(search: URLSearchParams) {
  const response = await fetchInternalApi(`/api/trips?${search.toString()}`);
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.data.items;
}

export default async function AgendaPage({
  searchParams
}: {
  searchParams: Promise<{ scheduledFrom?: string; scheduledTo?: string; trip?: string }>;
}) {
  const session = await getSessionContext();
  const sp = await searchParams;
  const realtimeTenantId =
    session.role === "guest" || session.userId === "anonymous" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);

  const defaults = defaultRangeUtc();
  const qs = new URLSearchParams({
    page: "1",
    pageSize: "250",
    includeAllRequested: "1",
    scheduledFrom: sp.scheduledFrom?.trim() || defaults.fromIso,
    scheduledTo: sp.scheduledTo?.trim() || defaults.toIso
  });

  const scheduledFrom = qs.get("scheduledFrom")!;
  const scheduledTo = qs.get("scheduledTo")!;

  const trips = await getTrips(qs);
  const focusRaw = sp.trip?.trim() || "";
  const focusTripId = z.string().uuid().safeParse(focusRaw).success ? focusRaw : "";
  const showClaimBar = session.role === "admin" || session.role === "operador";
  const showFinanceWrite = session.role === "admin" || session.role === "financeiro";
  const showErpEnqueue = session.role === "operador";
  const financeDevRole =
    session.role === "financeiro" ? "financeiro" : session.role === "operador" ? "operador" : "admin";
  let focusTrip = focusTripId ? trips.find((t: { id: string }) => t.id === focusTripId) : null;
  let focusOutsideRange = false;
  if (focusTripId && !focusTrip) {
    const detailRes = await fetchInternalApi(`/api/trips/${focusTripId}`);
    if (detailRes.ok) {
      const payload = await detailRes.json();
      focusTrip = payload.data ?? null;
      focusOutsideRange = Boolean(focusTrip);
    }
  }

  return (
    <>
      <OperationalRealtimeBridge tenantId={realtimeTenantId} />
      <AdminPageHeader
        title="Agenda operacional"
        subtitle="Timeline executiva de corridas programadas"
      />
      <StagingSmokeHints variant="light" />
      {showClaimBar ? (
        <OperadorTripCreatePanel scheduledFrom={scheduledFrom} scheduledTo={scheduledTo} />
      ) : null}
      <AgendaDateRangeForm initialFromIso={scheduledFrom} initialToIso={scheduledTo} />
      {showClaimBar ? (
        <OperationalHistoryPanel devFallbackRole={session.role === "operador" ? "operador" : "admin"} days={7} />
      ) : null}

      {showClaimBar ? (
        <InAppNotificationsPanel
          tenantId={realtimeTenantId}
          devFallbackRole={session.role === "operador" ? "operador" : "admin"}
          compact
          collapsible
          defaultCollapsed
        />
      ) : null}

      <section className="mt-8 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">Corridas</h2>
          <p className="text-sm text-slate-500">{trips.length} no período</p>
        </div>
        <AgendaTripsList
          trips={trips}
          operatorNotesHref={(id) => {
            const p = new URLSearchParams();
            p.set("trip", id);
            p.set("scheduledFrom", scheduledFrom);
            p.set("scheduledTo", scheduledTo);
            return `/agenda?${p.toString()}`;
          }}
        />
      </section>
      {focusTripId ? (
        <div className="mt-8 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <BackButton
                fallbackHref={`/agenda?scheduledFrom=${encodeURIComponent(scheduledFrom)}&scheduledTo=${encodeURIComponent(scheduledTo)}`}
              />
              <h2 className="text-lg font-semibold text-slate-900">Detalhe da viagem selecionada</h2>
            </div>
          </div>
          {focusOutsideRange ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Esta viagem está fora do intervalo de datas filtrado — acções abaixo usam dados actualizados da API.
            </p>
          ) : null}
          <TripFocusHeader
            tripId={focusTripId}
            operationalStatus={focusTrip?.operational_status ?? "requested"}
            serviceType={focusTrip?.service_type}
            scheduledAt={focusTrip?.scheduled_at}
            passengerCount={focusTrip?.passenger_count}
            passengerName={focusTrip?.passenger_name}
            passengerPhone={focusTrip?.passenger_phone}
            clientAmount={focusTrip?.client_amount}
            driverAmount={focusTrip?.driver_amount}
            margin={focusTrip?.margin}
          />
          <TripAgendaFocusPanel
            tripId={focusTripId}
            operationalStatus={focusTrip?.operational_status ?? "requested"}
            scheduledAt={focusTrip?.scheduled_at}
            assignedDriverId={focusTrip?.driver_id}
            assignedVehicle={focusTrip?.vehicle}
            showClaimBar={showClaimBar}
            showFinanceWrite={showFinanceWrite}
            showErpEnqueue={showErpEnqueue}
            financeDevRole={financeDevRole}
          />
        </div>
      ) : focusRaw ? (
        <p className="mt-6 text-sm text-red-700">Identificador de viagem inválido na URL.</p>
      ) : (
        <p className="mt-8 text-sm text-slate-500">
          Clique em <strong>Abrir</strong> numa corrida para aprovar, despachar e registar notas.
        </p>
      )}
    </>
  );
}
