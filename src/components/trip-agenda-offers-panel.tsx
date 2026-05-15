"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { TripOperationalStatus } from "@/lib/domain/types";

type DriverOption = {
  id: string;
  cpf: string;
  profile_name?: string | null;
};

type OfferResponse = {
  driver_id: string;
  status: string;
  eta_minutes: number | null;
  driver?: { profile_name: string | null; cpf: string };
};

type Offer = {
  id: string;
  status: string;
  expires_at: string;
  responses: OfferResponse[];
  recipient_driver_ids: string[];
};

type Props = {
  tripId: string;
  operationalStatus: TripOperationalStatus;
  devFallbackRole?: "operador" | "admin";
  onDone?: () => void;
};

const OFFER_CREATABLE: TripOperationalStatus[] = ["approved", "reassigned"];

export function TripAgendaOffersPanel({
  tripId,
  operationalStatus,
  devFallbackRole = "operador",
  onDone
}: Props) {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [offers, setOffers] = useState<Offer[]>([]);
  const [expiresIn, setExpiresIn] = useState(180);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/dispatch-offers`, {}, devFallbackRole);
    const json = (await res.json()) as { success?: boolean; data?: { items: Offer[] } };
    if (res.ok && json.success) {
      setOffers(json.data?.items ?? []);
    }
  }, [tripId, devFallbackRole]);

  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/drivers", {}, devFallbackRole);
      const json = (await res.json()) as { success?: boolean; data?: DriverOption[] };
      if (res.ok && json.success) {
        setDrivers(json.data ?? []);
      }
      await loadOffers();
    })();
  }, [devFallbackRole, loadOffers]);

  function toggleDriver(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createOffer() {
    if (selected.size === 0) {
      setMessage("Seleccione pelo menos um motorista.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      "/api/dispatch/offers",
      {
        method: "POST",
        body: JSON.stringify({
          trip_id: tripId,
          candidate_driver_ids: [...selected],
          expires_in_seconds: expiresIn
        })
      },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setLoading(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao criar oferta.");
      return;
    }
    setMessage("Oferta enviada aos parceiros seleccionados.");
    setSelected(new Set());
    await loadOffers();
    onDone?.();
  }

  async function approveOffer(offerId: string, driverId: string) {
    setLoading(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/dispatch/offers/${offerId}/approve`,
      { method: "POST", body: JSON.stringify({ driver_id: driverId }) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setLoading(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao aprovar oferta.");
      return;
    }
    setMessage("Oferta aprovada — corrida despachada.");
    await loadOffers();
    onDone?.();
  }

  if (!OFFER_CREATABLE.includes(operationalStatus) && offers.length === 0) {
    return null;
  }

  const openOffer = offers.find((o) => o.status === "open");
  const acceptedResponses =
    openOffer?.responses.filter((r) => r.status === "accepted") ?? [];

  return (
    <div className="rounded border border-violet-200 bg-violet-50/80 px-4 py-3 text-sm">
      <p className="font-medium text-violet-950">Despacho por oferta</p>
      <p className="mt-1 text-xs text-violet-800">
        Parceiros recebem push; confirme quem aceitou (ETA opcional no app motorista).
      </p>

      {openOffer ? (
        <div className="mt-3 rounded border border-violet-200 bg-white p-3">
          <p className="text-xs text-slate-600">
            Oferta aberta · expira{" "}
            {new Date(openOffer.expires_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
          {acceptedResponses.length === 0 ? (
            <p className="mt-2 text-slate-500">A aguardar aceites dos parceiros…</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {acceptedResponses.map((r) => {
                const label = r.driver?.profile_name?.trim() || r.driver?.cpf || r.driver_id.slice(0, 8);
                return (
                  <li key={r.driver_id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {label}
                      {r.eta_minutes != null ? (
                        <span className="ml-1 text-xs text-slate-500">· ETA {r.eta_minutes} min</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void approveOffer(openOffer.id, r.driver_id)}
                      className="rounded bg-violet-700 px-3 py-1 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-50"
                    >
                      Confirmar parceiro
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Convites: {openOffer.recipient_driver_ids.length} motorista(s)
          </p>
        </div>
      ) : OFFER_CREATABLE.includes(operationalStatus) ? (
        <>
          <div className="mt-3 max-h-40 overflow-y-auto rounded border border-violet-100 bg-white p-2">
            {drivers.length === 0 ? (
              <p className="text-slate-500">Sem motoristas activos.</p>
            ) : (
              <ul className="space-y-1">
                {drivers.map((d) => (
                  <li key={d.id}>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={() => toggleDriver(d.id)}
                        disabled={loading}
                      />
                      <span>{d.profile_name?.trim() || `CPF ${d.cpf}`}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
            Expira em (s)
            <input
              type="number"
              min={30}
              max={3600}
              value={expiresIn}
              onChange={(e) => setExpiresIn(Number(e.target.value) || 180)}
              className="w-20 rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <button
            type="button"
            disabled={loading || selected.size === 0}
            onClick={() => void createOffer()}
            className="mt-3 rounded-lg bg-violet-700 px-4 py-2 font-medium text-white hover:bg-violet-600 disabled:opacity-50"
          >
            {loading ? "A enviar…" : "Criar oferta"}
          </button>
        </>
      ) : null}

      {offers.some((o) => o.status === "approved") ? (
        <p className="mt-2 text-xs text-green-800">Última oferta já foi aprovada para esta viagem.</p>
      ) : null}

      {message ? <p className="mt-2 text-slate-800">{message}</p> : null}
    </div>
  );
}
