"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { VoucherGroup } from "@/lib/finance/voucher-groups";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<string, string> = {
  completed: "✓ concluído",
  in_progress: "em viagem",
  arrived: "no local",
  on_the_way: "a caminho",
  dispatched: "agendado",
  accepted: "agendado",
  approved: "agendado",
  requested: "pedido"
};

function plus30(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

/**
 * Fechamento por voucher (clientes que fecham por serviço, ex.: CEP):
 * todos os serviços do mesmo NR (B, C1, C2…) viram UMA fatura e UM boleto.
 */
export function VouchersToCloseCard({ onClosed }: { onClosed?: () => void }) {
  const [groups, setGroups] = useState<VoucherGroup[]>([]);
  const [due, setDue] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession("/api/client-invoices/vouchers", {}, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { groups: VoucherGroup[] } };
    if (j.success) setGroups(j.data?.groups ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function close(g: VoucherGroup) {
    setBusy(g.key);
    setMsg(null);
    const r = await fetchWithSupabaseSession(
      `/api/trips/${g.first_trip_id}/invoice`,
      { method: "POST", body: JSON.stringify({ due_date: due[g.key] || plus30() }) },
      "admin"
    );
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { number: number; trip_ids: string[]; total_amount: number }; error?: { message?: string } };
    setBusy(null);
    if (!r.ok || !j.success || !j.data) return setMsg({ ok: false, text: j.error?.message ?? "Não foi possível fechar." });
    setMsg({
      ok: true,
      text: `${g.ref}: fatura ${String(j.data.number).padStart(5, "0")} criada com ${j.data.trip_ids.length} serviço(s), ${brl(j.data.total_amount)}. Anexe o boleto na lista de faturas abaixo.`
    });
    await load();
    onClosed?.();
  }

  if (!groups.length) return null;
  const ready = groups.filter((g) => g.ready).length;

  return (
    <section className="grid gap-3 rounded-2xl border-2 border-prime-gold/60 bg-[#FBF8F1] p-4">
      <div>
        <h3 className="font-semibold">Vouchers a fechar {ready ? <span className="text-prime-gold-ink">· {ready} pronto(s)</span> : null}</h3>
        <p className="text-xs text-prime-muted">
          Clientes que fecham por serviço (ex.: CEP). Todos os serviços do mesmo NR — inclusive os que você dividiu entre motoristas (C1, C2…) — viram uma fatura e um boleto.
        </p>
      </div>
      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
      <div className="grid gap-2">
        {groups.map((g) => (
          <div key={g.key} className={`rounded-xl bg-white p-3 ring-1 ${g.ready ? "ring-emerald-300" : "ring-prime-border"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {g.ref} <span className="font-normal text-prime-muted">· {g.client_name}</span>
                </p>
                <p className="text-xs text-prime-muted">
                  {g.trips.length} serviço(s) · {brl(g.total)}
                  {g.ready ? " · pronto para fechar" : ` · faltam ${g.pending} concluir`}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                {g.has_voucher_file ? (
                  <a
                    href={`/api/trips/${g.trips.find((t) => t.has_voucher)?.id}/client-voucher`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-prime-border"
                  >
                    🧾 Voucher
                  </a>
                ) : null}
                {g.ready ? (
                  <>
                    <label className="grid gap-0.5 text-xs">
                      Vencimento do boleto
                      <input
                        type="date"
                        value={due[g.key] ?? plus30()}
                        onChange={(e) => setDue((m) => ({ ...m, [g.key]: e.target.value }))}
                        className="rounded-md border px-2 py-1 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy === g.key}
                      onClick={() => void close(g)}
                      className="rounded-lg bg-prime-gold px-3 py-2 text-sm font-bold text-[#111] disabled:opacity-50"
                    >
                      {busy === g.key ? "Fechando…" : "Fechar voucher"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <ul className="mt-2 grid gap-1 text-sm">
              {g.trips.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2">
                  <a href={`/agenda?trip=${t.id}`} className="font-medium underline decoration-dotted">
                    {t.ref}
                  </a>
                  <span className="text-prime-muted">{when(t.scheduled_at)}</span>
                  <span className={t.operational_status === "completed" ? "text-emerald-700" : "text-amber-700"}>{STATUS[t.operational_status] ?? t.operational_status}</span>
                  <span className="ml-auto">{t.client_amount != null ? brl(t.client_amount) : "sem valor"}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
