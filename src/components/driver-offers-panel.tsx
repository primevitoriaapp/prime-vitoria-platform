"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { notifyDriverNewAssignment } from "@/lib/client/driver-alert-notify";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useDriverPushRefresh } from "@/hooks/use-driver-push-refresh";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

type OpenOffer = {
  id: string;
  expires_at: string;
  trip?: {
    scheduled_at: string;
    origin_text: string;
    destination_text: string;
    passenger_name: string | null;
  } | null;
  my_response?: { status: string; eta_minutes: number | null } | null;
};

type Props = {
  tenantId?: string | null;
  driverId?: string | null;
  devFallbackRole?: "motorista" | "admin";
};

export function DriverOffersPanel({
  tenantId = null,
  driverId = null,
  devFallbackRole = "motorista"
}: Props) {
  const [offers, setOffers] = useState<OpenOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const knownOfferIdsRef = useRef<Set<string>>(new Set());
  const offersInitializedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = driverId ? `?driver_id=${encodeURIComponent(driverId)}` : "";
    const res = await fetchWithSupabaseSession(`/api/dispatch/offers/open${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as { success?: boolean; data?: { items: OpenOffer[] } };
    const items = res.ok && json.success ? (json.data?.items ?? []) : [];
    const newOffers = items.filter((o) => !knownOfferIdsRef.current.has(o.id));
    if (offersInitializedRef.current && newOffers.length > 0) {
      notifyDriverNewAssignment("offer");
    }
    knownOfferIdsRef.current = new Set(items.map((o) => o.id));
    offersInitializedRef.current = true;
    setOffers(items);
    setLoading(false);
  }, [devFallbackRole, driverId]);

  const docVisible = useDocumentVisible();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!docVisible) return;
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load, docVisible]);

  useTenantTableRefresh(tenantId, ["dispatch_offers", "trips"], () => void load());

  useDriverPushRefresh(() => void load(), () => notifyDriverNewAssignment("offer"));

  async function accept(offerId: string, etaMinutes?: number) {
    setBusyId(offerId);
    setMessage(null);
    const body: Record<string, number | string> = {};
    if (etaMinutes != null) body.eta_minutes = etaMinutes;
    if (driverId) body.driver_id = driverId;

    const res = await fetchWithSupabaseSession(
      `/api/dispatch/offers/${offerId}/accept`,
      { method: "POST", body: JSON.stringify(body) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusyId(null);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Não foi possível aceitar a oferta.");
      return;
    }
    setMessage("Oferta aceite. Aguarde confirmação da central.");
    await load();
  }

  if (loading) {
    return <p className="text-sm text-slate-500">A carregar ofertas…</p>;
  }

  if (offers.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Sem ofertas abertas da central. Corridas já despachadas aparecem em <strong className="text-slate-400">Corridas activas</strong>.
      </p>
    );
  }

  return (
    <section className="rounded-xl border border-violet-800/50 bg-violet-950/40 p-4">
      <h2 className="text-lg font-semibold text-violet-200">Ofertas da central</h2>
      {message ? (
        <p className="mt-2 text-sm text-amber-200/90" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {offers.map((offer) => {
          const trip = offer.trip;
          const accepted = offer.my_response?.status === "accepted";
          return (
            <li key={offer.id} className="prime-driver-card p-3 text-sm">
              {trip ? (
                <>
                  <p className="font-medium text-white">
                    {trip.passenger_name?.trim() || "Passageiro"} ·{" "}
                    {formatBrDateTime(trip.scheduled_at)}
                  </p>
                  <p className="mt-1 text-slate-400">
                    {trip.origin_text} → {trip.destination_text}
                  </p>
                </>
              ) : null}
              <p className="mt-1 text-xs text-violet-300/80">
                Expira{" "}
                {formatBrDateTime(offer.expires_at)}
              </p>
              {accepted ? (
                <p className="mt-2 text-xs text-green-400">Aceite registado — aguarde confirmação.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === offer.id}
                    onClick={() => void accept(offer.id)}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    Aceitar oferta
                  </button>
                  <button
                    type="button"
                    disabled={busyId === offer.id}
                    onClick={() => void accept(offer.id, 15)}
                    className="rounded-lg border border-violet-600 px-3 py-1.5 text-violet-200 hover:bg-violet-900/50 disabled:opacity-50"
                  >
                    Aceitar · ETA 15 min
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
