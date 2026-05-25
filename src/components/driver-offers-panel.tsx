"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useDriverPushRefresh } from "@/hooks/use-driver-push-refresh";

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
  devFallbackRole?: "motorista";
};

export function DriverOffersPanel({ devFallbackRole = "motorista" }: Props) {
  const [offers, setOffers] = useState<OpenOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession("/api/dispatch/offers/open", {}, devFallbackRole);
    const json = (await res.json()) as { success?: boolean; data?: { items: OpenOffer[] } };
    setOffers(res.ok && json.success ? (json.data?.items ?? []) : []);
    setLoading(false);
  }, [devFallbackRole]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 25_000);
    return () => clearInterval(t);
  }, [load]);

  useDriverPushRefresh(() => void load());

  async function accept(offerId: string, etaMinutes?: number) {
    setBusyId(offerId);
    setMessage(null);
    const body: Record<string, number> = {};
    if (etaMinutes != null) body.eta_minutes = etaMinutes;

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
            <li key={offer.id} className="rounded-lg border border-violet-800/60 bg-slate-950/60 p-3 text-sm">
              {trip ? (
                <>
                  <p className="font-medium text-white">
                    {trip.passenger_name?.trim() || "Passageiro"} ·{" "}
                    {new Date(trip.scheduled_at).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short"
                    })}
                  </p>
                  <p className="mt-1 text-slate-400">
                    {trip.origin_text} → {trip.destination_text}
                  </p>
                </>
              ) : null}
              <p className="mt-1 text-xs text-violet-300/80">
                Expira{" "}
                {new Date(offer.expires_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
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
