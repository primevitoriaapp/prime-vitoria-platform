"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { DriverFichaPanel } from "@/components/driver-ficha-panel";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

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
  whatsapp?: string | null;
  employment_type?: "funcionario" | "parceiro" | null;
  cnh_expires_at?: string | null;
  cnh_expiry?: string | null;
  default_vehicle?: { id: string; model: string; plate: string } | null;
  linked_vehicles?: LinkedVehicle[];
};

function cnhStatus(expiry: string | null): { text: string; tone: string } {
  if (!expiry) return { text: "Sem vencimento", tone: "text-prime-muted" };
  const d = new Date(`${expiry.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { text: "—", tone: "" };
  const days = Math.round((d.getTime() - Date.now()) / 86400000);
  const label = d.toLocaleDateString("pt-BR");
  if (days < 0) return { text: `Vencida ${label}`, tone: "font-semibold text-red-700" };
  if (days <= 30) return { text: `Vence ${label}`, tone: "font-semibold text-amber-700" };
  return { text: `Válida até ${label}`, tone: "" };
}

type FormFeedback = {
  kind: "success" | "error" | "info";
  message: string;
  code?: string;
  hint?: string;
};

const inputClass = PRIME_INPUT_CLASS;

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
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

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
          message: json.error?.message ?? "Falha ao cadastrar motorista.",
          hint: json.error?.hint
        });
        return;
      }
      setFeedback({ kind: "success", message: "Motorista cadastrado. Abra a ficha para completar os dados." });
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

  async function removeDriver(driver: DriverRow) {
    const name = driver.profile_name ?? "este motorista";
    if (
      !window.confirm(
        `Excluir ${name}?\n\nSe ele já fez corridas, o sistema só desativa (para não perder o histórico). Se nunca fez, apaga de vez.`
      )
    )
      return;
    const res = await fetchWithSupabaseSession(`/api/drivers/${driver.id}`, { method: "DELETE" }, "admin");
    const json = await parseApiResponse(res);
    if (!res.ok || json.success !== true) {
      setFeedback({ kind: "error", message: json.error?.message ?? "Não foi possível excluir.", code: json.error?.code });
      return;
    }
    const msg = (json.data as { message?: string } | undefined)?.message ?? "Feito.";
    setFeedback({ kind: "success", message: msg });
    if (fichaDriverId === driver.id) setFichaDriverId(null);
    await reloadDrivers();
  }

  const q = search.trim().toLowerCase();
  const visibleDrivers = drivers.filter((d) => {
    if (!q) return true;
    return [d.profile_name, d.cpf, d.phone, d.default_vehicle?.plate, d.default_vehicle?.model]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  if (fichaDriverId) {
    return (
      <>
        <FeedbackBanner feedback={feedback} />
        <DriverFichaPanel
          driverId={fichaDriverId}
          onClose={() => {
            setFichaDriverId(null);
            window.scrollTo({ top: 0 });
          }}
          onSaved={() => void reloadDrivers()}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${inputClass} max-w-sm flex-1`}
          placeholder="Buscar por nome, CPF, telefone ou placa"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-prime-muted">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Mostrar desativados
        </label>
        <Link href={"/importar" as Route} className="ml-auto rounded-lg px-3 py-2 text-sm ring-1 ring-prime-border hover:ring-prime-gold">
          Importar planilha
        </Link>
        <button type="button" className="btn-primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Fechar" : "+ Novo motorista"}
        </button>
      </div>

      <FeedbackBanner feedback={!fichaDriverId ? feedback : null} />

      {showCreate ? (
        <section className="card mt-4">
          <h2 className="text-lg font-semibold">Novo motorista</h2>
          <p className="mt-1 text-sm text-prime-muted">
            Comece com nome, CPF e CNH. A ficha completa abre em seguida para foto, contato, endereço, banco e veículo.
          </p>
          <form className="mt-4 grid gap-3 md:grid-cols-3" noValidate onSubmit={(e) => void createDriver(e)}>
            <label className="grid gap-1 text-sm">
              <span>Nome completo</span>
              <input required className={inputClass} value={createName} onChange={(e) => setCreateName(e.target.value)} />
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
              <button type="submit" disabled={creating} className="btn-primary disabled:opacity-50">
                {creating ? "Salvando…" : "Cadastrar e abrir ficha"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="mt-5">
        {visibleDrivers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-prime-border bg-white p-6 text-center text-sm text-prime-muted">
            {drivers.length === 0 ? "Nenhum motorista cadastrado." : "Nenhum motorista encontrado nessa busca."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleDrivers.map((driver) => {
              const cnhAlert = cnhStatus(driver.cnh_expires_at ?? driver.cnh_expiry ?? null);
              const inactive = driver.active === false;
              return (
                <article
                  key={driver.id}
                  className={`rounded-2xl border bg-white p-4 shadow-prime-card transition ${
                    fichaDriverId === driver.id ? "border-prime-gold ring-1 ring-prime-gold" : "border-prime-border"
                  } ${inactive ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#111] text-sm font-semibold text-prime-gold">
                        {driverInitials(driver.profile_name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-prime-text">{driver.profile_name ?? "Motorista"}</p>
                        <p className="text-xs text-prime-muted">
                          {driver.employment_type === "funcionario" ? "Funcionário" : "Parceiro"}
                          {driver.whatsapp || driver.phone ? ` · ${driver.whatsapp ?? driver.phone}` : ""}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        inactive ? "bg-gray-100 text-gray-600" : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                      }`}
                    >
                      {inactive ? "Desativado" : "Ativo"}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-prime-muted">Veículo</dt>
                      <dd className="truncate">{driver.default_vehicle?.model ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-prime-muted">Placa</dt>
                      <dd>{driver.default_vehicle?.plate ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-prime-muted">CPF</dt>
                      <dd>{driver.cpf}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-prime-muted">CNH</dt>
                      <dd className={cnhAlert.tone}>{cnhAlert.text}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-prime-border pt-3 text-sm">
                    <button
                      type="button"
                      className="font-semibold text-prime-gold hover:underline"
                      onClick={() => {
                        setFichaDriverId(driver.id);
                        setFeedback(null);
                        window.scrollTo({ top: 0 });
                      }}
                    >
                      Editar ficha
                    </button>
                    <button type="button" className="text-red-700 hover:underline" onClick={() => void removeDriver(driver)}>
                      Excluir
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

    </>
  );
}
