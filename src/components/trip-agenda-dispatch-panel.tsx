"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { notifyOperationalClaimChanged } from "@/lib/client/operational-claim-events";
import { isImmediateScheduledTrip } from "@/lib/dispatch/driver-offline-dispatch";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import {
  DRIVER_OPERATIONAL_STATUS_PT,
  isDriverOperationalStatus
} from "@/lib/drivers/operational-status";

type DispatchMode = "directed" | "offer";

type DriverOption = {
  id: string;
  cpf: string;
  profile_name?: string | null;
  operational_status?: string | null;
  default_vehicle?: { id: string; plate: string; model: string } | null;
  linked_vehicles?: { id: string; plate: string; model: string; is_default?: boolean }[];
};

type VehicleOption = { id: string; plate: string; model: string };

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
};

type Props = {
  tripId: string;
  operationalStatus: TripOperationalStatus;
  scheduledAt?: string | null;
  assignedDriverId?: string | null;
  assignedVehicle?: { id: string; plate: string; model: string } | null;
  devFallbackRole?: "operador" | "admin";
  onDone?: () => void;
};

const DISPATCHABLE: TripOperationalStatus[] = ["approved", "reassigned"];
const REASSIGNABLE: TripOperationalStatus[] = ["dispatched", "accepted", "on_the_way"];

function driverLabel(d: DriverOption): string {
  const name = d.profile_name?.trim() || `CPF ${d.cpf}`;
  const status = d.operational_status;
  const statusPt = isDriverOperationalStatus(status) ? DRIVER_OPERATIONAL_STATUS_PT[status] : status;
  return statusPt && status !== "online" ? `${name} (${statusPt})` : name;
}

export function TripAgendaDispatchPanel({
  tripId,
  operationalStatus,
  scheduledAt,
  assignedDriverId,
  assignedVehicle,
  devFallbackRole = "operador",
  onDone
}: Props) {
  const [mode, setMode] = useState<DispatchMode>("directed");
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [allVehicles, setAllVehicles] = useState<VehicleOption[]>([]);
  const [driverVehicles, setDriverVehicles] = useState<VehicleOption[]>([]);
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [offers, setOffers] = useState<Offer[]>([]);
  const [reassignDriverId, setReassignDriverId] = useState("");
  const [reassignVehicleId, setReassignVehicleId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const immediateTrip = scheduledAt ? isImmediateScheduledTrip(scheduledAt) : true;

  const loadOffers = useCallback(async () => {
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/dispatch-offers`, {}, devFallbackRole);
    const json = (await res.json()) as { success?: boolean; data?: { items: Offer[] } };
    if (res.ok && json.success) {
      setOffers(json.data?.items ?? []);
    }
  }, [tripId, devFallbackRole]);

  useEffect(() => {
    void (async () => {
      const [driversRes, vehiclesRes] = await Promise.all([
        fetchWithSupabaseSession("/api/drivers", {}, devFallbackRole),
        fetchWithSupabaseSession("/api/vehicles", {}, devFallbackRole)
      ]);
      const driversJson = (await driversRes.json()) as { success?: boolean; data?: DriverOption[] };
      const vehiclesJson = (await vehiclesRes.json()) as { success?: boolean; data?: VehicleOption[] };
      if (driversRes.ok && driversJson.success) {
        setDrivers(driversJson.data ?? []);
      }
      if (vehiclesRes.ok && vehiclesJson.success) {
        setAllVehicles(vehiclesJson.data ?? []);
      }
      await loadOffers();
    })();
  }, [devFallbackRole, loadOffers]);

  function vehiclesForDriver(driver: DriverOption | undefined): VehicleOption[] {
    if (!driver) return [];
    const linked = driver.linked_vehicles ?? [];
    if (linked.length > 0) {
      return linked.map((v) => ({ id: v.id, plate: v.plate, model: v.model }));
    }
    if (driver.default_vehicle) {
      return [driver.default_vehicle];
    }
    return [];
  }

  function onDriverChange(nextDriverId: string) {
    setDriverId(nextDriverId);
    const driver = drivers.find((d) => d.id === nextDriverId);
    const options = vehiclesForDriver(driver);
    setDriverVehicles(options);
    if (options.length === 1) {
      setVehicleId(options[0].id);
    } else {
      const def = driver?.linked_vehicles?.find((v) => v.is_default) ?? driver?.default_vehicle;
      setVehicleId(def?.id ?? "");
    }
  }

  function toggleDriver(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function dispatchDirected() {
    if (!driverId) {
      setMessage("Seleccione um motorista.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const payload: Record<string, string> = { driver_id: driverId };
    if (vehicleId) payload.vehicle_id = vehicleId;

    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/dispatch-directed`,
      { method: "POST", body: JSON.stringify(payload) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setLoading(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha no despacho.");
      return;
    }
    setMessage("Corrida despachada ao motorista.");
    notifyOperationalClaimChanged(tripId);
    onDone?.();
  }

  async function sendOffer() {
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
          expires_in_seconds: 180
        })
      },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setLoading(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao enviar oferta.");
      return;
    }
    setMessage("Oferta enviada aos motoristas seleccionados.");
    setSelected(new Set());
    await loadOffers();
    onDone?.();
  }

  async function approveOffer(offerId: string, offerDriverId: string) {
    setLoading(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/dispatch/offers/${offerId}/approve`,
      { method: "POST", body: JSON.stringify({ driver_id: offerDriverId }) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setLoading(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao confirmar parceiro.");
      return;
    }
    setMessage("Parceiro confirmado — corrida despachada.");
    notifyOperationalClaimChanged(tripId);
    await loadOffers();
    onDone?.();
  }

  async function reassign() {
    if (!reassignDriverId) {
      setMessage("Seleccione o novo motorista.");
      return;
    }
    if (reassignReason.trim().length < 3) {
      setMessage("Indique o motivo da reatribuição (mín. 3 caracteres).");
      return;
    }
    setLoading(true);
    setMessage(null);
    const payload: Record<string, string> = {
      new_driver_id: reassignDriverId,
      reason: reassignReason.trim()
    };
    if (reassignVehicleId) payload.vehicle_id = reassignVehicleId;

    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/reassign`,
      { method: "POST", body: JSON.stringify(payload) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setLoading(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha na reatribuição.");
      return;
    }
    setMessage("Motorista reatribuído.");
    notifyOperationalClaimChanged(tripId);
    setReassignReason("");
    onDone?.();
  }

  const openOffer = offers.find((o) => o.status === "open");
  const acceptedResponses = openOffer?.responses.filter((r) => r.status === "accepted") ?? [];
  const canCreateDispatch = DISPATCHABLE.includes(operationalStatus);

  if (canCreateDispatch) {
    return (
      <div className="rounded-lg border border-prime-border bg-white px-4 py-4 shadow-prime-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-prime-text">Despacho</h3>
          <div
            className="inline-flex rounded-lg border border-prime-border p-0.5 text-sm"
            role="group"
            aria-label="Modo de despacho"
          >
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${mode === "directed" ? "bg-prime-gold/20 font-medium text-prime-text" : "text-prime-muted"}`}
              onClick={() => setMode("directed")}
            >
              Direcionado
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${mode === "offer" ? "bg-prime-gold/20 font-medium text-prime-text" : "text-prime-muted"}`}
              onClick={() => setMode("offer")}
            >
              Por oferta
            </button>
          </div>
        </div>

        {!immediateTrip ? (
          <p className="mt-2 text-xs text-prime-muted">
            Agendamento futuro — motoristas offline podem ser despachados.
          </p>
        ) : null}

        {mode === "directed" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-prime-muted">Motorista</span>
              <select
                aria-label="Motorista"
                value={driverId}
                onChange={(e) => onDriverChange(e.target.value)}
                className="rounded-lg border border-prime-border px-3 py-2"
                disabled={loading || drivers.length === 0}
              >
                <option value="">— seleccionar —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {driverLabel(d)}
                    {d.default_vehicle ? ` · ${d.default_vehicle.plate}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="text-prime-muted">Veículo (opcional)</span>
              <select
                aria-label="Veículo"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="rounded-lg border border-prime-border px-3 py-2"
                disabled={loading}
              >
                <option value="">Padrão do motorista</option>
                {(driverId ? driverVehicles : allVehicles).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} · {v.model}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={loading || !driverId}
              onClick={() => void dispatchDirected()}
              className="btn-primary sm:col-span-2 disabled:opacity-50"
            >
              {loading ? "A despachar…" : "Despachar"}
            </button>
          </div>
        ) : openOffer ? (
          <div className="mt-4 rounded-lg border border-prime-border bg-prime-bg/50 p-3">
            <p className="text-sm font-medium text-prime-text">Oferta em aberto</p>
            <p className="mt-1 text-xs text-prime-muted">
              Expira{" "}
              {new Date(openOffer.expires_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short"
              })}
            </p>
            {acceptedResponses.length === 0 ? (
              <p className="mt-2 text-sm text-prime-muted">A aguardar aceites…</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {acceptedResponses.map((r) => {
                  const label = r.driver?.profile_name?.trim() || r.driver?.cpf || "Motorista";
                  return (
                    <li key={r.driver_id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-prime-text">
                        {label}
                        {r.eta_minutes != null ? (
                          <span className="text-prime-muted"> · ETA {r.eta_minutes} min</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void approveOffer(openOffer.id, r.driver_id)}
                        className="rounded-lg bg-prime-gold px-3 py-1.5 text-sm font-medium text-prime-text hover:opacity-90 disabled:opacity-50"
                      >
                        Confirmar
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <p className="mb-2 text-sm text-prime-muted">Seleccione os motoristas que receberão a oferta:</p>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-prime-border bg-prime-bg/30 p-2">
              {drivers.length === 0 ? (
                <p className="text-sm text-prime-muted">Sem motoristas activos.</p>
              ) : (
                <ul className="space-y-1">
                  {drivers.map((d) => (
                    <li key={d.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-white/60">
                        <input
                          type="checkbox"
                          checked={selected.has(d.id)}
                          onChange={() => toggleDriver(d.id)}
                          disabled={loading}
                        />
                        <span>{driverLabel(d)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              disabled={loading || selected.size === 0}
              onClick={() => void sendOffer()}
              className="btn-primary mt-3 w-full disabled:opacity-50 sm:w-auto"
            >
              {loading ? "A enviar…" : "Enviar oferta"}
            </button>
          </div>
        )}

        {message ? (
          <p className="mt-3 text-sm text-prime-text" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  if (assignedDriverId && !["requested", "approved", "cancelled"].includes(operationalStatus)) {
    const driver = drivers.find((d) => d.id === assignedDriverId);
    const driverLabelText = driver?.profile_name?.trim() || driver?.cpf || "Motorista";
    const vehicleLabel = assignedVehicle
      ? `${assignedVehicle.plate} (${assignedVehicle.model})`
      : driver?.default_vehicle
        ? `${driver.default_vehicle.plate} (${driver.default_vehicle.model})`
        : "—";

    return (
      <div className="rounded-lg border border-prime-border bg-white px-4 py-3 text-sm shadow-prime-card">
        <p className="font-medium text-prime-text">Atribuição</p>
        <p className="mt-1 text-prime-text">
          Motorista: <span className="font-medium">{driverLabelText}</span>
        </p>
        <p className="mt-0.5 text-prime-text">
          Veículo: <span className="font-medium">{vehicleLabel}</span>
        </p>
        <p className="mt-1 text-xs text-prime-muted">Estado: {STATUS_CORRIDA_PT[operationalStatus]}</p>
        {REASSIGNABLE.includes(operationalStatus) ? (
          <details className="mt-3 rounded-lg border border-prime-border bg-prime-bg/40 p-3">
            <summary className="cursor-pointer font-medium text-prime-text">Reatribuir motorista</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs text-prime-muted">Novo motorista</span>
                <select
                  aria-label="Novo motorista"
                  value={reassignDriverId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setReassignDriverId(nextId);
                    const d = drivers.find((x) => x.id === nextId);
                    const opts = vehiclesForDriver(d);
                    setReassignVehicleId(opts.length === 1 ? opts[0].id : (d?.default_vehicle?.id ?? ""));
                  }}
                  className="rounded-lg border border-prime-border px-2 py-2"
                  disabled={loading}
                >
                  <option value="">— seleccionar —</option>
                  {drivers
                    .filter((d) => d.id !== assignedDriverId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {driverLabel(d)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs text-prime-muted">Motivo</span>
                <input
                  aria-label="Motivo da reatribuição"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="Ex.: indisponibilidade do parceiro anterior"
                  className="rounded-lg border border-prime-border px-2 py-2"
                  disabled={loading}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={loading || !reassignDriverId}
              onClick={() => void reassign()}
              className="btn-outline mt-3 disabled:opacity-50"
            >
              {loading ? "A reatribuir…" : "Confirmar reatribuição"}
            </button>
          </details>
        ) : null}
        {message ? (
          <p className="mt-2 text-prime-text" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}
