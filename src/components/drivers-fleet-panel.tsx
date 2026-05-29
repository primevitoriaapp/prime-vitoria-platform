"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
type DriverRow = {
  id: string;
  cpf: string;
  cnh_number?: string | null;
  profile_name?: string | null;
  default_vehicle?: { id: string; model: string; plate: string } | null;
};

type VehicleOption = { id: string; plate: string; model: string };
type ProfileOption = { id: string; name: string; role: string; active?: boolean };

type Props = {
  initialDrivers: DriverRow[];
};

export function DriversFleetPanel({ initialDrivers }: Props) {
  const router = useRouter();
  const [drivers, setDrivers] = useState(initialDrivers);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [profileId, setProfileId] = useState("");
  const [cpf, setCpf] = useState("");
  const [cnh, setCnh] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyDriver, setBusyDriver] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
      const [vRes, pRes] = await Promise.all([
        fetch("/api/vehicles", { credentials: "include" }),
        fetch("/api/profiles", { credentials: "include" })
      ]);
      const vJson = (await vRes.json()) as { success?: boolean; data?: VehicleOption[] };
      const pJson = (await pRes.json()) as { success?: boolean; data?: ProfileOption[] };
      if (vRes.ok && vJson.success) setVehicles(vJson.data ?? []);
      if (pRes.ok && pJson.success) {
        const motoristas = (pJson.data ?? []).filter((p) => p.role === "motorista" && p.active !== false);
        setProfiles(motoristas);
        if (motoristas[0]) setProfileId(motoristas[0].id);
      }
    })();
  }, []);

  async function createDriver(e: React.FormEvent) {
    e.preventDefault();
    if (!profileId || !cpf.trim()) return;
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          profile_id: profileId,
          cpf: cpf.trim(),
          cnh_number: cnh.trim() || undefined
        })
      });
      const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? "Falha ao criar motorista");
      }
      setMessage("Motorista registado.");
      setCpf("");
      setCnh("");
      await reloadDrivers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setCreating(false);
    }
  }

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
      <section className="card">
        <h2 className="text-lg font-semibold text-slate-900">Novo motorista</h2>
        <p className="mt-1 text-sm text-slate-600">
          O perfil com papel motorista deve existir em Utilizadores (ou seed). Depois vincule CPF e veículo padrão.
        </p>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(e) => void createDriver(e)}>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Perfil (utilizador motorista)</span>
            <select
              required
              className="rounded border border-slate-300 px-2 py-2"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            >
              <option value="">— seleccionar —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.id.slice(0, 8)}…
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>CPF</span>
            <input
              required
              className="rounded border border-slate-300 px-2 py-2"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>CNH</span>
            <input
              className="rounded border border-slate-300 px-2 py-2"
              value={cnh}
              onChange={(e) => setCnh(e.target.value)}
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating || profiles.length === 0}
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {creating ? "A guardar…" : "Registar motorista"}
            </button>
            {profiles.length === 0 ? (
              <p className="mt-2 text-sm text-amber-800">
                Nenhum perfil motorista — execute o seed ou crie utilizador com papel motorista.
              </p>
            ) : null}
          </div>
        </form>
      </section>

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
                  <p className="font-medium text-slate-900">
                    {driver.profile_name ?? "Motorista"} · CPF {driver.cpf}
                  </p>
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
