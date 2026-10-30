import { z } from "zod";
import { AdminPageHeader } from "@/components/admin-page-header";
import { BackButton } from "@/components/back-button";
import { AgendaTripDetailAnchor } from "@/components/agenda-trip-detail-anchor";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { TripAgendaFocusPanel } from "@/components/trip-agenda-focus-panel";
import type { TripRow } from "@/components/trip-table";

type AgendaTrip = TripRow & {
  service_type?: string;
  passenger_count?: number;
  passenger_name?: string | null;
  passenger_phone?: string | null;
  client_amount?: number | null;
  driver_amount?: number | null;
  margin?: number | null;
  driver_id?: string | null;
  vehicle?: { id: string; model: string; plate: string } | null;
};
import { OperadorTripCreatePanel } from "@/components/operador-trip-create-panel";
import { TripFocusHeader } from "@/components/trip-focus-header";
import { TripWhatsappMessages } from "@/components/trip-whatsapp-messages";
import { defaultAgendaRangeIso } from "@/lib/operations/agenda-default-range";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { fetchInternalApi } from "@/lib/server/internal-fetch";
import { getSessionContext } from "@/lib/server/session";
import { BookingsBoard } from "@/components/bookings-board";
import { TripWizard } from "@/components/trip-wizard";
import { TripEditPanel } from "@/components/trip-edit-panel";
import { TripAssignCard } from "@/components/trip-assign-card";
import { TripProofCard } from "@/components/trip-proof-card";
import { StaleTripsPanel } from "@/components/stale-trips-panel";
import { TripExpensesReview } from "@/components/trip-expenses";
export default async function AgendaPage({
  searchParams
}: {
  searchParams: Promise<{ trip?: string; nova?: string; periodo?: string; grupo?: string }>;
}) {
  const session = await getSessionContext();
  const sp = await searchParams;
  const realtimeTenantId =
    session.role === "guest" || session.userId === "anonymous" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);

  const focusRaw = sp.trip?.trim() || "";
  const focusTripId = z.string().uuid().safeParse(focusRaw).success ? focusRaw : "";
  const showClaimBar = session.role === "admin" || session.role === "operador";
  const showFinanceWrite = session.role === "admin" || session.role === "financeiro";
  const showErpEnqueue = session.role === "operador";
  const financeDevRole =
    session.role === "financeiro" ? "financeiro" : session.role === "operador" ? "operador" : "admin";

  let focusTrip: AgendaTrip | null = null;
  if (focusTripId) {
    const detailRes = await fetchInternalApi(`/api/trips/${focusTripId}`);
    if (detailRes.ok) {
      const payload = (await detailRes.json().catch(() => null)) as { data?: AgendaTrip } | null;
      focusTrip = payload?.data ?? null;
    }
  }

  if (focusTripId) {
    return (
      <>
        <OperationalRealtimeBridge tenantId={realtimeTenantId} />
        <div id="trip-detail" className="scroll-mt-6 space-y-3">
          <AgendaTripDetailAnchor tripId={focusTripId} />
          <div className="flex flex-wrap items-center gap-3">
            <BackButton fallbackHref="/agenda" />
            <h1 className="font-prime-display text-2xl">Corrida</h1>
          </div>
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
          {showClaimBar ? <TripAssignCard tripId={focusTripId} /> : null}
          {showClaimBar ? <TripEditPanel tripId={focusTripId} /> : null}
          {showClaimBar ? <TripProofCard tripId={focusTripId} /> : null}
          {showClaimBar ? <TripExpensesReview tripId={focusTripId} /> : null}
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
          {showClaimBar ? <TripWhatsappMessages tripId={focusTripId} /> : null}
        </div>
      </>
    );
  }

  const defaults = defaultAgendaRangeIso();
  return (
    <>
      <AdminPageHeader
        title="Agenda"
        subtitle="Todas as corridas do período. Clique numa corrida para abrir, editar ou definir o motorista."
      />
      {focusRaw ? <p className="mb-4 text-sm text-red-700">Identificador de corrida inválido no endereço.</p> : null}
      {showClaimBar ? (
        <details open={sp.nova === "1"} className="mb-6 rounded-2xl border-2 border-prime-gold bg-white shadow-prime-card">
          <summary className="flex cursor-pointer list-none justify-center p-4 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-3 rounded-2xl bg-prime-gold px-8 py-4 text-lg font-bold text-[#111] shadow-lg transition hover:brightness-105">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#111] text-xl text-prime-gold">+</span>
              Agendar corrida
            </span>
          </summary>
          <div className="space-y-3 border-t border-prime-border p-2 sm:p-4">
            <TripWizard />
            <details className="rounded-xl border border-dashed border-prime-border">
              <summary className="cursor-pointer px-4 py-2 text-sm text-prime-muted">
                Corrida com vários trechos ou várias paradas de embarque (formulário completo)
              </summary>
              <div className="p-2">
                <OperadorTripCreatePanel scheduledFrom={defaults.fromIso} scheduledTo={defaults.toIso} />
              </div>
            </details>
          </div>
        </details>
      ) : null}
      <div className="mb-4">
        <StaleTripsPanel />
      </div>
      <BookingsBoard tenantId={realtimeTenantId} createHref={null} initialPeriod={sp.periodo} initialGroup={sp.grupo} showCalendar />
    </>
  );
}
