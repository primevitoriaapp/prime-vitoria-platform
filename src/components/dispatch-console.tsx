"use client";

import { FormEvent, useEffect, useState } from "react";

type VehicleOption = { id: string; plate: string; model: string };

export function DispatchConsole() {
  const [tripId, setTripId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [candidateIds, setCandidateIds] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/vehicles", { credentials: "include" });
      const json = (await res.json()) as { success?: boolean; data?: VehicleOption[] };
      if (res.ok && json.success) {
        setVehicles(json.data ?? []);
      }
    })();
  }, []);

  async function runAction(path: string, payload: Record<string, unknown>) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error?.message ?? "Falha operacional");
    return body.data;
  }

  async function onDispatchDirected(event: FormEvent) {
    event.preventDefault();
    try {
      const payload: Record<string, string> = { driver_id: driverId };
      if (vehicleId.trim()) payload.vehicle_id = vehicleId.trim();
      await runAction(`/api/trips/${tripId}/dispatch-directed`, payload);
      setMessage("Despacho direcionado realizado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro no despacho.");
    }
  }

  async function onCreateOffer(event: FormEvent) {
    event.preventDefault();
    try {
      const candidates = candidateIds
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      await runAction("/api/dispatch/offers", { trip_id: tripId, candidate_driver_ids: candidates, expires_in_seconds: 180 });
      setMessage("Oferta criada e enviada para parceiros.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao criar oferta.");
    }
  }

  return (
    <section className="card">
      <h2>Console de despacho</h2>
      <form onSubmit={onDispatchDirected} className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <input value={tripId} onChange={(event) => setTripId(event.target.value)} placeholder="ID da corrida" />
        <input value={driverId} onChange={(event) => setDriverId(event.target.value)} placeholder="ID do motorista (despacho direcionado)" />
        <label style={{ display: "grid", gap: 4 }}>
          <span className="text-sm text-slate-600">Veículo (opcional)</span>
          <select
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
            style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px" }}
          >
            <option value="">Automático / sem veículo</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} · {v.model}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Despachar direcionado</button>
      </form>
      <form onSubmit={onCreateOffer} className="grid" style={{ marginTop: 12 }}>
        <textarea
          value={candidateIds}
          onChange={(event) => setCandidateIds(event.target.value)}
          placeholder="IDs de motoristas parceiros, separados por vírgula"
          rows={4}
        />
        <button type="submit">Criar oferta automática</button>
      </form>
      {message ? <p>{message}</p> : null}
    </section>
  );
}
