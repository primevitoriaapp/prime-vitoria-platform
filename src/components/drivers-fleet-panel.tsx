"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DriverFichaPanel } from "@/components/driver-ficha-panel";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type LinkedVehicle = {
  link_id: string;
  id: string;
  plate: string;
  model: string;
  brand?: string | null;
  is_default?: boolean;
};

export type DriverRow = {
  id: string;
  cpf: string;
  profile_id?: string;
  cnh_number?: string | null;
  profile_name?: string | null;
  phone?: string | null;
  active?: boolean;
  default_vehicle?: { id: string; model: string; plate: string } | null;
  linked_vehicles?: LinkedVehicle[];
};

type FormFeedback = {
  kind: "success" | "error" | "info";
  message: string;
  code?: string;
  hint?: string;
};

const inputClass = "rounded border border-slate-300 px-2 py-2 w-full text-sm";

async function parseApiResponse(res: Response) {
  const text = await res.text();
  if (!text.trim()) {
    return {
      success: false as const,
      error: { code: `HTTP_${res.status}`, message: `Resposta vazia (HTTP ${res.status}).` }
    };
  }
  try {
    return JSON.parse(text) as {
      success?: boolean;
      data?: unknown;
      error?: { code?: string; message?: string; hint?: string };
    };
  } catch {
    return {
      success: false as const,
      error: {
        code: `HTTP_${res.status}`,
        message: res.status === 401 ? "Sessão expirada. Inicie sessão novamente." : `Resposta inválida (HTTP ${res.status}).`
      }
    };
  }
}

function FeedbackBanner({ feedback }: { feedback: FormFeedback | null }) {
  if (!feedback) return null;
  return (
    <div
      role="alert"
      className={`mt-3 rounded-lg border px-3 py-3 text-sm ${
        feedback.kind === "error"
          ? "border-red-300 bg-red-50 text-red-950"
          : feedback.kind === "success"
            ? "border-emerald-300 bg-emerald-50 text-emerald-950"
            : "border-amber-300 bg-amber-50 text-amber-950"
      }`}
    >
      {feedback.code ? <p className="mb-1 font-mono text-xs opacity-80">Código: {feedback.code}</p> : null}
      <p className="font-medium">{feedback.message}</p>
      {feedback.hint ? <p className="mt-2 text-xs opacity-90">{feedback.hint}</p> : null}
    </div>
  );
}

type Props = {
  initialDrivers: DriverRow[];
};

export function DriversFleetPanel({ initialDrivers }: Props) {
  const router = useRouter();
  const [drivers, setDrivers] = useState(initialDrivers);
  const [fichaDriverId, setFichaDriverId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createCpf, setCreateCpf] = useState("");
  const [createCnh, setCreateCnh] = useState("");
  const [creating, setCreating] = useState(false);

  const reloadDrivers = useCallback(async () => {
    const qs = includeInactive ? "?include_inactive=1" : "";
    const res = await fetchWithSupabaseSession(`/api/drivers${qs}`, {}, "admin");
    const json = await parseApiResponse(res);
    if (res.ok && json.success) {
      setDrivers((json.data as DriverRow[]) ?? []);
    }
    router.refresh();
  }, [router, includeInactive]);

  useEffect(() => {
    void reloadDrivers();
  }, [reloadDrivers]);

  async function createDriver(e: FormEvent) {
    e.preventDefault();
    if (!createName.trim() || !createCpf.trim()) {
      setFeedback({ kind: "error", message: "Informe nome completo e CPF." });
      return;
    }
    setCreating(true);
    setFeedback(null);
    try {
      const res = await fetchWithSupabaseSession(
        "/api/drivers",
        {
          method: "POST",
          body: JSON.stringify({
            full_name: createName.trim(),
            cpf: createCpf.trim(),
            cnh_number: createCnh.trim() || undefined
          })
        },
        "admin"
      );
      const json = await parseApiResponse(res);
      if (!res.ok || json.success !== true) {
        setFeedback({
          kind: "error",
          code: json.error?.code,
          message: json.error?.message ?? "Falha ao registar motorista.",
          hint: json.error?.hint
        });
        return;
      }
      setFeedback({ kind: "success", message: "Motorista registado. Abra a ficha para completar os dados." });
      setCreateName("");
      setCreateCpf("");
      setCreateCnh("");
      await reloadDrivers();
      const created = json.data as DriverRow | undefined;
      if (created?.id) setFichaDriverId(created.id);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao criar motorista."
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <section className="card">
        <h2 className="text-lg font-semibold text-slate-900">Cadastro rápido</h2>
        <p className="mt-1 text-sm text-slate-600">
          Nome, CPF e CNH. Depois use <strong>Abrir ficha</strong> para foto, endereço, operacional, financeiro e veículos.
        </p>
        <form className="mt-4 grid gap-3 md:grid-cols-3" noValidate onSubmit={(e) => void createDriver(e)}>
          <label className="grid gap-1 text-sm">
            <span>Nome completo</span>
            <input
              required
              className={inputClass}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>CPF</span>
            <input
              required
              className={inputClass}
              value={createCpf}
              onChange={(e) => setCreateCpf(e.target.value)}
              placeholder="000.000.000-00"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>CNH</span>
            <input className={inputClass} value={createCnh} onChange={(e) => setCreateCnh(e.target.value)} />
          </label>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {creating ? "A guardar…" : "Registar motorista"}
            </button>
          </div>
        </form>
        <FeedbackBanner feedback={!fichaDriverId ? feedback : null} />
      </section>

      <section className="card mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Motoristas</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Incluir inactivos
          </label>
        </div>
        {drivers.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nenhum motorista registado.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {drivers.map((driver) => (
              <li key={driver.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {driver.profile_name ?? "Motorista"} · CPF {driver.cpf}
                    {driver.active === false ? (
                      <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700">inactivo</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    CNH {driver.cnh_number ?? "—"}
                    {(driver.linked_vehicles?.length ?? 0) > 0 ? (
                      <span className="ml-2 text-amber-800">
                        · {driver.linked_vehicles!.length} veículo(s)
                        {driver.default_vehicle ? ` · padrão ${driver.default_vehicle.plate}` : ""}
                      </span>
                    ) : (
                      <span className="ml-2 text-slate-400">· sem veículos vinculados</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-amber-700 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-50"
                  onClick={() => {
                    setFichaDriverId(driver.id);
                    setFeedback(null);
                  }}
                >
                  {fichaDriverId === driver.id ? "Ficha aberta" : "Abrir ficha"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {fichaDriverId ? (
        <DriverFichaPanel
          driverId={fichaDriverId}
          onClose={() => setFichaDriverId(null)}
          onSaved={() => void reloadDrivers()}
        />
      ) : null}
    </>
  );
}
