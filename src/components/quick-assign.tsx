"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

export type AssignDriver = {
  id: string;
  name: string;
  status: string | null;
  employment: string | null;
  vehicle: { id: string; model: string; plate: string } | null;
};

const STATUS_TEXT: Record<string, { label: string; cls: string }> = {
  online: { label: "Livre", cls: "text-emerald-700" },
  ocupado: { label: "Ocupado", cls: "text-red-700" },
  deslocando: { label: "A caminho", cls: "text-blue-700" },
  no_local: { label: "No local", cls: "text-blue-700" },
  em_atendimento: { label: "Em corrida", cls: "text-red-700" },
  offline: { label: "Offline", cls: "text-prime-muted" }
};

function humanError(code: string | undefined, message: string | undefined): string {
  switch (code) {
    case "DISPATCH_CONFLICT":
      return "Esse motorista já tem corrida perto desse horário (1h30 antes ou depois).";
    case "DRIVER_OFFLINE":
      return "Motorista offline e a corrida é para agora. Escolha alguém online.";
    case "DRIVER_NOT_AVAILABLE":
      return "Motorista desativado.";
    case "INVALID_STATUS_TRANSITION":
      return "Essa corrida já mudou de situação. Atualize a página.";
    case "CLAIM_NOT_OWNER":
      return "Outro operador está cuidando dessa corrida agora.";
    default:
      return message ?? "Não foi possível definir o motorista.";
  }
}

/** Botão do cartão da Agenda: define ou troca o motorista sem abrir a corrida. */
export function QuickAssign({
  tripId,
  status,
  currentDriverId,
  drivers,
  onDone
}: {
  tripId: string;
  status: string;
  currentDriverId: string | null;
  drivers: AssignDriver[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  const isSwap = Boolean(currentDriverId) && ["dispatched", "accepted", "reassigned"].includes(status);
  const canAssign = ["requested", "approved"].includes(status) || isSwap;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!canAssign) return null;

  async function assign(d: AssignDriver) {
    setBusy(d.id);
    setError(null);
    const vehicle = d.vehicle?.id;
    let res: Response;
    if (isSwap) {
      res = await fetchWithSupabaseSession(
        `/api/trips/${tripId}/reassign`,
        { method: "POST", body: JSON.stringify({ new_driver_id: d.id, reason: "Troca pela agenda", ...(vehicle ? { vehicle_id: vehicle } : {}) }) },
        "admin"
      );
    } else {
      if (status === "requested") {
        const ap = await fetchWithSupabaseSession(`/api/trips/${tripId}/approve`, { method: "POST" }, "admin");
        const apJson = (await ap.json().catch(() => ({}))) as { success?: boolean; data?: { operational_status?: string }; error?: { code?: string; message?: string } };
        if (!ap.ok || !apJson.success) {
          setBusy(null);
          setError(humanError(apJson.error?.code, apJson.error?.message));
          return;
        }
      }
      res = await fetchWithSupabaseSession(
        `/api/trips/${tripId}/dispatch-directed`,
        { method: "POST", body: JSON.stringify({ driver_id: d.id, ...(vehicle ? { vehicle_id: vehicle } : {}) }) },
        "admin"
      );
    }
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { code?: string; message?: string } };
    setBusy(null);
    if (!res.ok || !json.success) {
      setError(humanError(json.error?.code, json.error?.message));
      return;
    }
    setOpen(false);
    onDone();
  }

  const list = drivers
    .filter((d) => d.id !== currentDriverId)
    .filter((d) => !q.trim() || [d.name, d.vehicle?.plate, d.vehicle?.model].filter(Boolean).some((v) => String(v).toLowerCase().includes(q.toLowerCase())));

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
          isSwap ? "ring-1 ring-prime-border hover:ring-prime-gold" : "bg-[#111] text-[#fff] hover:bg-black"
        }`}
      >
        {isSwap ? "Trocar motorista" : "Definir motorista"}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(360px,calc(100vw-32px))] rounded-2xl border border-prime-border bg-white p-3 shadow-xl">
          <input
            autoFocus
            className="prime-input mb-2 w-full text-sm"
            placeholder="Buscar motorista ou placa"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {error ? <p className="mb-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800">{error}</p> : null}
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {list.length === 0 ? <li className="px-2 py-3 text-sm text-prime-muted">Nenhum motorista ativo.</li> : null}
            {list.map((d) => {
              const st = STATUS_TEXT[d.status ?? ""] ?? { label: d.status ?? "—", cls: "text-prime-muted" };
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void assign(d)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-prime-bg disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{d.name}</span>
                      <span className="block truncate text-xs text-prime-muted">
                        {d.vehicle ? `${d.vehicle.model} · ${d.vehicle.plate}` : "sem veículo padrão"}
                        {d.employment === "funcionario" ? " · funcionário" : " · parceiro"}
                      </span>
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${st.cls}`}>{busy === d.id ? "Enviando…" : st.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-prime-muted">
            O motorista recebe a corrida no app{isSwap ? "; o anterior é avisado da troca" : ""}. Pedido novo é confirmado junto.
          </p>
        </div>
      ) : null}
    </div>
  );
}
