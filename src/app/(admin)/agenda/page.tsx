import Link from "next/link";
import { z } from "zod";
import { AgendaDateRangeForm } from "@/components/agenda-date-range-form";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { TripAgendaOperationalStack } from "@/components/trip-agenda-operational-stack";
import { TripTable } from "@/components/trip-table";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { fetchInternalApi } from "@/lib/server/internal-fetch";
import { getSessionContext } from "@/lib/server/session";

function defaultRangeUtc(): { fromIso: string; toIso: string } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 14);
  end.setUTCHours(23, 59, 59, 999);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
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
    pageSize: "100",
    scheduledFrom: sp.scheduledFrom?.trim() || defaults.fromIso,
    scheduledTo: sp.scheduledTo?.trim() || defaults.toIso
  });

  const scheduledFrom = qs.get("scheduledFrom")!;
  const scheduledTo = qs.get("scheduledTo")!;

  const trips = await getTrips(qs);
  const focusRaw = sp.trip?.trim() || "";
  const focusTripId = z.string().uuid().safeParse(focusRaw).success ? focusRaw : "";
  const showClaimBar = session.role === "admin" || session.role === "operador";

  return (
    <main>
      <OperationalRealtimeBridge tenantId={realtimeTenantId} />
      <h1>Agenda operacional</h1>
      <p className="mb-4 max-w-3xl text-sm text-slate-600">
        Viagens ordenadas por horário agendado. Use o intervalo para planear o período; em tempo real, as alterações de
        estado aparecem na tabela quando o tenant da sessão corresponde.
      </p>
      <AgendaDateRangeForm initialFromIso={scheduledFrom} initialToIso={scheduledTo} />
      <TripTable
        trips={trips}
        operatorNotesHref={(id) => {
          const p = new URLSearchParams();
          p.set("trip", id);
          p.set("scheduledFrom", scheduledFrom);
          p.set("scheduledTo", scheduledTo);
          return `/agenda?${p.toString()}`;
        }}
      />
      {focusTripId ? (
        <div className="mt-8 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Notas da viagem selecionada</h2>
            <Link
              href={`/agenda?scheduledFrom=${encodeURIComponent(scheduledFrom)}&scheduledTo=${encodeURIComponent(scheduledTo)}`}
              className="text-sm font-medium text-amber-700 hover:underline"
            >
              Fechar painel
            </Link>
          </div>
          <TripAgendaOperationalStack tripId={focusTripId} showClaimBar={showClaimBar} />
        </div>
      ) : focusRaw ? (
        <p className="mt-6 text-sm text-red-700">Identificador de viagem inválido na URL.</p>
      ) : (
        <p className="mt-6 text-sm text-slate-500">
          Para notas entre operadores, escolha uma viagem na tabela (ligação &quot;Notas&quot;).
        </p>
      )}
    </main>
  );
}
