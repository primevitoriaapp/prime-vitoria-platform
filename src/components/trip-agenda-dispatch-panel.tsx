"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { notifyOperationalClaimChanged } from "@/lib/client/operational-claim-events";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";

type DriverOption = {
  id: string;
  cpf: string;
  profile_name?: string | null;
  default_vehicle?: { id: string; plate: string; model: string } | null;
};

type VehicleOption = { id: string; plate: string; model: string };

type Props = {
  tripId: string;
  operationalStatus: TripOperationalStatus;
  assignedDriverId?: string | null;
  assignedVehicle?: { id: string; plate: string; model: string } | null;
  devFallbackRole?: "operador" | "admin";
  onDone?: () => void;
};

const DISPATCHABLE: TripOperationalStatus[] = ["approved", "reassigned"];
const REASSIGNABLE: TripOperationalStatus[] = ["dispatched", "accepted", "on_the_way"];

export function TripAgendaDispatchPanel({
  tripId,
  operationalStatus,
  assignedDriverId,
  assignedVehicle,
  devFallbackRole = "operador",
  onDone
}: Props) {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [reassignDriverId, setReassignDriverId] = useState("");
  const [reassignVehicleId, setReassignVehicleId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
        setVehicles(vehiclesJson.data ?? []);
      }
    })();
  }, [devFallbackRole]);

  function onDriverChange(nextDriverId: string) {
    setDriverId(nextDriverId);
    const driver = drivers.find((d) => d.id === nextDriverId);
    setVehicleId(driver?.default_vehicle?.id ?? "");
  }

  async function dispatch() {
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
      setMessage(json.error?.message ?? "Falha no despacho. Confirme reivindicação da corrida (multiatendimento).");
      return;
    }
    setMessage("Corrida despachada ao motorista.");
    notifyOperationalClaimChanged(tripId);
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
    setMessage("Motorista reatribuído; novo parceiro notificado.");
    notifyOperationalClaimChanged(tripId);
    setReassignReason("");
    onDone?.();
  }

  if (DISPATCHABLE.includes(operationalStatus)) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <p className="font-medium text-slate-900">Despacho direcionado</p>
        <p className="mt-1 text-xs text-slate-600">
          Estado actual: {STATUS_CORRIDA_PT[operationalStatus]}. Escolha motorista e veículo (opcional).
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs text-slate-600">Motorista</span>
            <select
              aria-label="Motorista"
              value={driverId}
              onChange={(e) => onDriverChange(e.target.value)}
              className="rounded border border-slate-300 px-2 py-2"
              disabled={loading || drivers.length === 0}
            >
              <option value="">— seleccionar —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.profile_name?.trim() || `CPF ${d.cpf}`}
                  {d.default_vehicle ? ` · ${d.default_vehicle.plate}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-slate-600">Veículo</span>
            <select
              aria-label="Veículo"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="rounded border border-slate-300 px-2 py-2"
              disabled={loading}
            >
              <option value="">Padrão do motorista / automático</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.model}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={loading || !driverId}
          onClick={() => void dispatch()}
          className="mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {loading ? "A despachar…" : "Despachar corrida"}
        </button>
        {message ? (
          <p className="mt-2 text-slate-700" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  if (assignedDriverId && !["requested", "approved", "cancelled"].includes(operationalStatus)) {
    const driver = drivers.find((d) => d.id === assignedDriverId);
    const driverLabel = driver?.profile_name?.trim() || driver?.cpf || assignedDriverId.slice(0, 8);
    const vehicleLabel = assignedVehicle
      ? `${assignedVehicle.plate} (${assignedVehicle.model})`
      : driver?.default_vehicle
        ? `${driver.default_vehicle.plate} (${driver.default_vehicle.model})`
        : "—";

    return (
      <div className="rounded border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Atribuição</p>
        <p className="mt-1">
          Motorista: <span className="font-medium">{driverLabel}</span>
        </p>
        <p className="mt-0.5">
          Veículo: <span className="font-medium">{vehicleLabel}</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">Estado: {STATUS_CORRIDA_PT[operationalStatus]}</p>
        {REASSIGNABLE.includes(operationalStatus) ? (
          <details className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer font-medium text-amber-800">Reatribuir motorista</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Novo motorista</span>
                <select
                  aria-label="Novo motorista"
                  value={reassignDriverId}
                  onChange={(e) => {
                    setReassignDriverId(e.target.value);
                    const d = drivers.find((x) => x.id === e.target.value);
                    setReassignVehicleId(d?.default_vehicle?.id ?? "");
                  }}
                  className="rounded border border-slate-300 px-2 py-2"
                  disabled={loading}
                >
                  <option value="">— seleccionar —</option>
                  {drivers
                    .filter((d) => d.id !== assignedDriverId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.profile_name?.trim() || `CPF ${d.cpf}`}
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Veículo</span>
                <select
                  aria-label="Veículo reatribuição"
                  value={reassignVehicleId}
                  onChange={(e) => setReassignVehicleId(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-2"
                  disabled={loading}
                >
                  <option value="">Manter / padrão</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · {v.model}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs text-slate-600">Motivo</span>
                <input
                  aria-label="Motivo da reatribuição"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="Ex.: indisponibilidade do parceiro anterior"
                  className="rounded border border-slate-300 px-2 py-2"
                  disabled={loading}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={loading || !reassignDriverId}
              onClick={() => void reassign()}
              className="mt-3 rounded-lg border border-amber-700 px-4 py-2 font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
            >
              {loading ? "A reatribuir…" : "Confirmar reatribuição"}
            </button>
          </details>
        ) : null}
        {message ? (
          <p className="mt-2 text-slate-700" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}
