"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Inv = {
  id: string;
  number: number;
  due_date: string;
  status: string;
  total_amount: number;
  boleto_path: string | null;
  boleto_line: string | null;
  voucher_path: string | null;
  client_ref: string | null;
};
type Data = {
  status: string;
  per_service: boolean;
  has_voucher: boolean;
  invoice: Inv | null;
  suggested_due: string;
  driver_payout_if_due: string;
  forecast_due_without_invoice: string;
};

const br = (d: string) => d.split("-").reverse().join("/");
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const STATUS: Record<string, string> = { aberta: "Aberta", enviada: "Enviada", paga: "Paga", cancelada: "Cancelada" };

/** No detalhe da corrida: fechar este serviço (voucher/NR), vencimento do boleto, boleto e voucher anexados. */
export function TripInvoiceCard({ tripId }: { tripId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editDue, setEditDue] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadKind, setUploadKind] = useState<"boleto" | "voucher">("boleto");

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/invoice`, {}, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Data };
    if (j.success && j.data) {
      setD(j.data);
      setDue(j.data.invoice?.due_date ?? j.data.suggested_due);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!d || d.status !== "completed") return null;
  const inv = d.invoice;

  async function create() {
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/invoice`, { method: "POST", body: JSON.stringify({ due_date: due }) }, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { number: number; trip_ids: string[]; total_amount: number }; error?: { message?: string } };
    setBusy(false);
    if (!r.ok || !j.success || !j.data) return setMsg({ ok: false, text: j.error?.message ?? "Não foi possível fechar." });
    setMsg({
      ok: true,
      text: `Fatura ${String(j.data.number).padStart(5, "0")} criada (${j.data.trip_ids.length} corrida${j.data.trip_ids.length > 1 ? "s" : ""}, ${brl(j.data.total_amount)}). Agora anexe o boleto.`
    });
    await load();
  }

  async function saveDue() {
    if (!inv) return;
    setBusy(true);
    const r = await fetchWithSupabaseSession(`/api/client-invoices/${inv.id}`, { method: "PATCH", body: JSON.stringify({ due_date: due }) }, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    setEditDue(false);
    setMsg(r.ok && j.success ? { ok: true, text: "Vencimento alterado. A carteira do motorista já mostra a nova data." } : { ok: false, text: j.error?.message ?? "Falha ao salvar." });
    await load();
  }

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.append("file", file);
    let url = `/api/trips/${tripId}/client-voucher`;
    if (uploadKind === "boleto" && inv) {
      form.append("kind", "boleto");
      url = `/api/client-invoices/${inv.id}/files`;
    }
    const r = await fetchWithSupabaseSession(url, { method: "POST", body: form }, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    setMsg(r.ok && j.success ? { ok: true, text: uploadKind === "boleto" ? "Boleto anexado. O cliente já vê no portal." : "Voucher guardado na corrida." } : { ok: false, text: j.error?.message ?? "Falha ao enviar." });
    await load();
  }

  const pick = (k: "boleto" | "voucher") => {
    setUploadKind(k);
    window.setTimeout(() => fileRef.current?.click(), 0);
  };
  const btn = "rounded-lg px-3 py-1.5 text-sm ring-1 ring-prime-border hover:ring-prime-gold disabled:opacity-50";

  return (
    <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Fechamento e boleto</h3>
        {d.per_service ? <span className="rounded-full bg-prime-bg px-3 py-1 text-xs">Cliente fecha por serviço (cada voucher)</span> : null}
      </div>

      {inv ? (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-prime-bg p-3">
              <p className="text-xs text-prime-muted">Fatura</p>
              <p className="font-semibold">
                {String(inv.number).padStart(5, "0")}
                {inv.client_ref ? ` · ${inv.client_ref}` : ""}
              </p>
              <p className="text-xs">{STATUS[inv.status] ?? inv.status}</p>
            </div>
            <div className="rounded-xl bg-prime-bg p-3">
              <p className="text-xs text-prime-muted">Total</p>
              <p className="font-semibold">{brl(inv.total_amount)}</p>
            </div>
            <div className="rounded-xl bg-prime-bg p-3">
              <p className="text-xs text-prime-muted">Boleto vence</p>
              {editDue ? (
                <span className="flex items-center gap-1">
                  <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-md border px-1 py-1 text-sm" />
                  <button type="button" disabled={busy} onClick={() => void saveDue()} className="text-sm font-semibold text-emerald-700">
                    OK
                  </button>
                </span>
              ) : (
                <button type="button" disabled={inv.status === "paga"} onClick={() => setEditDue(true)} className="font-semibold underline decoration-dotted disabled:no-underline">
                  {br(inv.due_date)}
                </button>
              )}
            </div>
            <div className="rounded-xl bg-[#111] p-3 text-[#fff]">
              <p className="text-xs text-[#C8C3B8]">Motorista recebe em</p>
              <p className="font-semibold text-[#C9A84C]">{br(d.driver_payout_if_due)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {inv.boleto_path ? (
              <a className={btn} href={`/api/client-invoices/${inv.id}/files?kind=boleto`} target="_blank" rel="noopener noreferrer">
                📄 Ver boleto
              </a>
            ) : null}
            <button type="button" disabled={busy} className={btn} onClick={() => pick("boleto")}>
              {inv.boleto_path ? "Trocar boleto" : "⬆ Anexar boleto"}
            </button>
            {d.has_voucher || inv.voucher_path ? (
              <a className={btn} href={`/api/trips/${tripId}/client-voucher`} target="_blank" rel="noopener noreferrer">
                🧾 Ver voucher do cliente
              </a>
            ) : (
              <button type="button" disabled={busy} className={btn} onClick={() => pick("voucher")}>
                ⬆ Anexar voucher do cliente
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <p className="text-sm text-prime-muted">
            Ainda sem fatura. Sem fechar, o sistema prevê o vencimento em <b>{br(d.forecast_due_without_invoice)}</b>.
            {d.per_service ? " Feche este serviço quando emitir o boleto: os outros trechos concluídos do mesmo voucher (NR) entram juntos." : ""}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              <span>Vencimento do boleto</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-md border px-2 py-1.5 text-sm" />
            </label>
            <button type="button" disabled={busy || !due} onClick={() => void create()} className="rounded-lg bg-prime-gold px-4 py-2 text-sm font-bold text-[#111] disabled:opacity-50">
              {busy ? "Fechando…" : "Fechar este serviço e gerar fatura"}
            </button>
            {d.has_voucher ? (
              <a className={btn} href={`/api/trips/${tripId}/client-voucher`} target="_blank" rel="noopener noreferrer">
                🧾 Ver voucher
              </a>
            ) : (
              <button type="button" disabled={busy} className={btn} onClick={() => pick("voucher")}>
                ⬆ Anexar voucher
              </button>
            )}
          </div>
          <p className="text-xs text-prime-muted">O motorista recebe depois do vencimento + os dias de conciliação do cliente (sempre em dia útil: fim de semana e feriado passam para o próximo).</p>
        </div>
      )}
      {msg ? <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
    </section>
  );
}
