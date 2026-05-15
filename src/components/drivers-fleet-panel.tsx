"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EntityCrudPanel } from "@/components/entity-crud-panel";

type DriverRow = {
  id: string;
  cpf: string;
  cnh_number?: string | null;
  default_vehicle?: { id: string; model: string; plate: string } | null;
};

type VehicleOption = { id: string; plate: string; model: string };

type Props = {
  initialDrivers: DriverRow[];
};

export function DriversFleetPanel({ initialDrivers }: Props) {
  const router = useRouter();
  const [drivers, setDrivers] = useState(initialDrivers);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyDriver, setBusyDriver] = useState<string | null>(null);

  const reloadDrivers = useCallback(async () => {
    const res = await fetch("/api/drivers", { credentials: "include" });
    const json = (await res.json()) as { success?: boolean; data?: DriverRow[] };
    if (res.ok && json.success) {
      setDrivers(json.data ?? []);
    }
    router.refresh();
  }, [router]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/vehicles", { credentials: "include" });
      const json = (await res.json()) as { success?: boolean; data?: VehicleOption[] };
      if (res.ok && json.success) {
        setVehicles(json.data ?? []);
      }
    })();
  }, []);

  async function setDefaultVehicle(driverId: string, vehicleId: string) {
    if (!vehicleId) return;
    setBusyDriver(driverId);
    setMessage(null);
    try {
      const res = await fetch(`/api/drivers/${driverId}/default-vehicle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ vehicle_id: vehicleId })
      });
      const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? "Falha ao vincular veículo");
      }
      setMessage("Veículo padrão actualizado.");
      await reloadDrivers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusyDriver(null);
    }
  }

  return (
    <>
      <EntityCrudPanel
        title="Novo motorista"
        endpoint="/api/drivers"
        fields={[
          { key: "profile_id", label: "ID do perfil", required: true },
          { key: "cpf", label: "CPF", required: true },
          { key: "cnh_number", label: "CNH" },
          { key: "cnh_category", label: "Categoria CNH" },
          { key: "pix_key", label: "Chave PIX" },
          { key: "address", label: "Endereço" }
        ]}
        onSuccess={() => void reloadDrivers()}
      />

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-slate-900">Motoristas activos</h2>
        {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
        {drivers.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nenhum motorista registado.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {drivers.map((driver) => (
              <li key={driver.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-900">CPF {driver.cpf}</p>
                  <p className="text-xs text-slate-500">
                    CNH {driver.cnh_number ?? "não informada"}
                    {driver.default_vehicle ? (
                      <span className="ml-2 text-amber-800">
                        · veículo {driver.default_vehicle.plate} ({driver.default_vehicle.model})
                      </span>
                    ) : (
                      <span className="ml-2 text-slate-400">· sem veículo padrão</span>
                    )}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-slate-700">
                  <span className="text-xs">Veículo padrão</span>
                  <select
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    disabled={busyDriver === driver.id || vehicles.length === 0}
                    value={driver.default_vehicle?.id ?? ""}
                    onChange={(e) => void setDefaultVehicle(driver.id, e.target.value)}
                  >
                    <option value="">— seleccionar —</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate} · {v.model}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
