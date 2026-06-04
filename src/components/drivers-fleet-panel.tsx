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

const inputClass = "rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 w-full text-sm text-slate-100";

function driverInitials(name: string | null | undefined): string {
  const parts = (name ?? "M").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "M";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

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
        <h2 className="text-lg font-semibold">Cadastro rápido</h2>
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
              className="btn-primary disabled:opacity-50"
            >
              {creating ? "A guardar…" : "Registar motorista"}
            </button>
          </div>
        </form>
        <FeedbackBanner feedback={!fichaDriverId ? feedback : null} />
      </section>

      <section className="card mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Frota de motoristas</h2>
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
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {drivers.map((driver) => (
              <article
                key={driver.id}
                className={`rounded-xl border bg-slate-900/40 p-4 transition-colors ${
                  fichaDriverId === driver.id ? "border-amber-500/50" : "border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/90 to-amber-600 text-sm font-semibold text-slate-950">
                      {driverInitials(driver.profile_name)}
                    </span>
                    <div>
                      <p className="font-medium text-white">{driver.profile_name ?? "Motorista"}</p>
                      <p className="text-xs text-slate-500">{driver.phone ?? `CPF ${driver.cpf}`}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      driver.active === false
                        ? "bg-slate-800 text-slate-500"
                        : "bg-emerald-500/15 text-emerald-400"
                    }`}
                  >
                    {driver.active === false ? "Inactivo" : "Disponível"}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div>
                    <dt className="text-slate-500">Veículo</dt>
                    <dd className="text-slate-300">{driver.default_vehicle?.model ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Placa</dt>
                    <dd className="text-slate-300">{driver.default_vehicle?.plate ?? "—"}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">CNH</dt>
                    <dd className="text-slate-300">{driver.cnh_number ?? "—"}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="mt-4 w-full text-right text-sm font-medium text-amber-400 hover:text-amber-300"
                  onClick={() => {
                    setFichaDriverId(driver.id);
                    setFeedback(null);
                  }}
                >
                  {fichaDriverId === driver.id ? "Ficha aberta →" : "Ver perfil →"}
                </button>
              </article>
            ))}
          </div>
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
