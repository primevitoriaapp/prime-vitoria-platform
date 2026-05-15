"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { EntityCrudPanel } from "@/components/entity-crud-panel";

export type VehicleRow = {
  id: string;
  model: string;
  plate: string;
  category?: string | null;
  capacity?: number | null;
  color?: string | null;
  active: boolean;
};

type Props = {
  initialVehicles: VehicleRow[];
};

export function VehiclesFleetPanel({ initialVehicles }: Props) {
  const router = useRouter();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ model: "", plate: "", category: "", capacity: "", color: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch("/api/vehicles", { credentials: "include" });
    const json = (await res.json()) as { success?: boolean; data?: VehicleRow[] };
    if (res.ok && json.success) {
      setVehicles(json.data ?? []);
    }
    router.refresh();
  }, [router]);

  function startEdit(vehicle: VehicleRow) {
    setEditingId(vehicle.id);
    setForm({
      model: vehicle.model,
      plate: vehicle.plate,
      category: vehicle.category ?? "",
      capacity: vehicle.capacity != null ? String(vehicle.capacity) : "",
      color: vehicle.color ?? ""
    });
    setMessage(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        model: form.model.trim(),
        plate: form.plate.trim(),
        category: form.category.trim() || null,
        color: form.color.trim() || null
      };
      const cap = form.capacity.trim();
      payload.capacity = cap ? Number(cap) : null;

      const res = await fetch(`/api/vehicles/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? "Falha ao actualizar");
      }
      setEditingId(null);
      setMessage("Veículo actualizado.");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(vehicle: VehicleRow) {
    if (!window.confirm(`Desactivar ${vehicle.plate}?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: false })
      });
      const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? "Falha ao desactivar");
      }
      setMessage(`${vehicle.plate} desactivado.`);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <EntityCrudPanel
        title="Novo veículo"
        endpoint="/api/vehicles"
        fields={[
          { key: "model", label: "Modelo", required: true },
          { key: "plate", label: "Placa", required: true },
          { key: "category", label: "Categoria" },
          { key: "capacity", label: "Capacidade", type: "number" },
          { key: "color", label: "Cor" }
        ]}
        onSuccess={() => void reload()}
      />

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-slate-900">Frota activa</h2>
        {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
        {vehicles.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nenhum veículo registado.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2 pr-3">Placa</th>
                  <th className="py-2 pr-3">Modelo</th>
                  <th className="py-2 pr-3">Categoria</th>
                  <th className="py-2 pr-3">Cap.</th>
                  <th className="py-2">Acções</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="border-b border-slate-100">
                    {editingId === vehicle.id ? (
                      <>
                        <td className="py-2 pr-2">
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1"
                            value={form.plate}
                            onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1"
                            value={form.model}
                            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1"
                            value={form.category}
                            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            className="w-16 rounded border border-slate-300 px-2 py-1"
                            value={form.capacity}
                            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                          />
                        </td>
                        <td className="py-2">
                          <button type="button" disabled={busy} onClick={() => void saveEdit()} className="mr-2 text-amber-800">
                            Guardar
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-slate-600">
                            Cancelar
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-3 font-medium">{vehicle.plate}</td>
                        <td className="py-2 pr-3">{vehicle.model}</td>
                        <td className="py-2 pr-3">{vehicle.category ?? "—"}</td>
                        <td className="py-2 pr-3">{vehicle.capacity ?? "—"}</td>
                        <td className="py-2">
                          <button type="button" className="mr-3 text-amber-800" onClick={() => startEdit(vehicle)}>
                            Editar
                          </button>
                          <button type="button" className="text-red-700" disabled={busy} onClick={() => void deactivate(vehicle)}>
                            Desactivar
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
