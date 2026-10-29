"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Expense = { id: string; kind: string; amount: number; status: string; notes: string | null; receipt_url: string | null; charge_client: boolean; created_at: string };

const KINDS: { id: string; label: string }[] = [
  { id: "pedagio", label: "Pedágio" },
  { id: "estacionamento", label: "Estacionamento" },
  { id: "combustivel", label: "Combustível" },
  { id: "alimentacao", label: "Alimentação" },
  { id: "outros", label: "Outra" }
];
const label = (k: string) => KINDS.find((x) => x.id === k)?.label ?? k;
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ST: Record<string, string> = { pendente: "aguardando a central", aprovada: "aprovada", recusada: "recusada" };

function useExpenses(tripId: string, role: "motorista" | "admin") {
  const [rows, setRows] = useState<Expense[]>([]);
  const load = useCallback(async () => {
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/expenses`, {}, role);
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Expense[] };
    if (j.success) setRows(j.data ?? []);
  }, [tripId, role]);
  useEffect(() => {
    void load();
  }, [load]);
  return { rows, load };
}

/** App do motorista: lançar pedágio/estacionamento com foto do comprovante. */
export function DriverTripExpenses({ tripId, devFallbackRole = "motorista" }: { tripId: string; devFallbackRole?: "motorista" | "admin" }) {
  const { rows, load } = useExpenses(tripId, devFallbackRole);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("pedagio");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("amount", amount);
    if (file) fd.set("file", file);
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/expenses`, { method: "POST", body: fd }, devFallbackRole);
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !j.success) return setErr(j.error?.message ?? "Não foi possível salvar.");
    setOpen(false);
    setAmount("");
    setFile(null);
    void load();
  }

  return (
    <div className="rounded-2xl border border-[#3A3A3E] p-3 text-sm text-[#F5F5F5]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">🧾 Pedágio / estacionamento</span>
        {!open ? (
          <button type="button" className="rounded-lg bg-[#C9A84C] px-3 py-1.5 text-xs font-semibold text-[#111]" onClick={() => setOpen(true)}>
            + Lançar
          </button>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="mt-2 space-y-1 text-xs text-[#CCCCCC]">
          {rows.map((r) => (
            <li key={r.id}>
              {label(r.kind)} {brl(r.amount)} · {ST[r.status] ?? r.status}
              {r.receipt_url ? " · com foto" : ""}
            </li>
          ))}
        </ul>
      ) : !open ? (
        <p className="mt-1 text-xs text-[#AAAAAA]">Pagou algo na corrida? Lance aqui com a foto do comprovante para ser reembolsado.</p>
      ) : null}
      {open ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button key={k.id} type="button" onClick={() => setKind(k.id)} className={`rounded-full px-3 py-1.5 text-xs ring-1 ${kind === k.id ? "bg-[#C9A84C] text-[#111] ring-[#C9A84C]" : "ring-[#3A3A3E]"}`}>
                {k.label}
              </button>
            ))}
          </div>
          <input
            inputMode="decimal"
            placeholder="Valor (ex.: 12,40)"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
            className="w-full rounded-xl border border-[#3A3A3E] bg-[#111] px-3 py-2.5 text-base text-[#fff]"
          />
          <label className="block rounded-xl border border-dashed border-[#C9A84C] px-3 py-3 text-center text-xs">
            {file ? `📷 ${file.name}` : "📷 Tirar foto do comprovante"}
            <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {err ? <p className="text-xs text-red-300">{err}</p> : null}
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-xl border border-[#3A3A3E] px-3 py-2.5 text-sm" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="button" disabled={busy || !amount} className="flex-[2] rounded-xl bg-[#C9A84C] px-3 py-2.5 text-sm font-semibold text-[#111] disabled:opacity-50" onClick={() => void save()}>
              {busy ? "Enviando…" : "Salvar despesa"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Agenda (central): conferir a despesa com a foto e aprovar (reembolso) ou recusar. */
export function TripExpensesReview({ tripId }: { tripId: string }) {
  const { rows, load } = useExpenses(tripId, "admin");
  const [charge, setCharge] = useState<Record<string, boolean>>({});
  if (!rows.length) return null;

  async function decide(id: string, decision: "aprovada" | "recusada") {
    await fetchWithSupabaseSession(`/api/trips/${tripId}/expenses/${id}`, { method: "PATCH", body: JSON.stringify({ decision, charge_client: Boolean(charge[id]) }) }, "admin");
    void load();
  }

  return (
    <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <h2 className="text-base font-semibold">Despesas lançadas pelo motorista</h2>
      <ul className="mt-3 divide-y divide-prime-border text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span>
              <b>{label(r.kind)}</b> · {brl(r.amount)}
              {r.receipt_url ? (
                <a href={r.receipt_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-prime-gold underline">
                  ver comprovante
                </a>
              ) : (
                <span className="ml-2 text-xs text-amber-700">sem foto</span>
              )}
            </span>
            {r.status === "pendente" ? (
              <span className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={Boolean(charge[r.id])} onChange={(e) => setCharge({ ...charge, [r.id]: e.target.checked })} />
                  cobrar do cliente
                </label>
                <button type="button" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-[#fff]" onClick={() => void decide(r.id, "aprovada")}>
                  Aprovar reembolso
                </button>
                <button type="button" className="rounded-lg px-3 py-1.5 text-xs text-red-700 ring-1 ring-red-200" onClick={() => void decide(r.id, "recusada")}>
                  Recusar
                </button>
              </span>
            ) : (
              <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === "aprovada" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                {r.status === "aprovada" ? `Aprovada${r.charge_client ? " · cobrada do cliente" : ""}` : "Recusada"}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-prime-muted">Aprovada: soma no repasse do motorista. Com “cobrar do cliente”, soma também no valor da corrida.</p>
    </section>
  );
}
