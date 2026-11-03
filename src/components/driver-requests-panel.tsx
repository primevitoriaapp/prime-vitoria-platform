"use client";

import { useCallback, useEffect, useState } from "react";

type Req = {
  id: string;
  kind: "vehicle" | "cnh" | "pix";
  payload: Record<string, string | number | null>;
  created_at: string;
  file_url: string | null;
  category_name: string | null;
  driver: { full_name: string | null; cnh_number: string | null; cnh_category: string | null; cnh_expires_at: string | null; pix_key: string | null } | null;
};

const LABEL = { vehicle: "Troca de veículo", cnh: "CNH nova", pix: "Nova chave PIX" } as const;
const br = (ymd: unknown) => (ymd ? String(ymd).slice(0, 10).split("-").reverse().join("/") : "—");

/** Pedidos que os motoristas mandaram pelo app (veículo, CNH, PIX) para a central aprovar. */
export function DriverRequestsPanel() {
  const [items, setItems] = useState<Req[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const j = await fetch("/api/driver-requests", { credentials: "include" }).then((r) => r.json()).catch(() => null);
    setItems(j?.success ? (j.data.items as Req[]) : []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    let note: string | undefined;
    if (action === "reject") {
      note = window.prompt("Motivo (o motorista recebe esta mensagem):") ?? undefined;
      if (note === undefined) return;
    }
    setBusy(id);
    await fetch(`/api/driver-requests/${id}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) });
    setBusy(null);
    void load();
  }

  if (!items || items.length === 0) return null;
  return (
    <section id="pedidos" className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <h2 className="text-base font-semibold text-amber-900">
        {items.length} pedido{items.length === 1 ? "" : "s"} dos motoristas para aprovar
      </h2>
      <ul className="mt-3 grid gap-3 lg:grid-cols-2">
        {items.map((r) => {
          const p = r.payload;
          return (
            <li key={r.id} className="rounded-xl border border-amber-200 bg-white p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-prime-text">{r.driver?.full_name ?? "Motorista"}</p>
                  <p className="text-xs text-prime-muted">
                    {LABEL[r.kind]} · {new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
                {r.file_url ? (
                  <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-prime-border">
                    Ver documento
                  </a>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {r.kind === "vehicle" ? (
                  <>
                    <p>
                      <span className="text-prime-muted">Carro:</span> <b>{[p.brand, p.model, p.model_year].filter(Boolean).join(" ")}</b>
                    </p>
                    <p>
                      <span className="text-prime-muted">Placa:</span> <b>{p.plate}</b>
                    </p>
                    <p>
                      <span className="text-prime-muted">Cor:</span> {p.color ?? "—"}
                    </p>
                    <p>
                      <span className="text-prime-muted">Categoria:</span> {r.category_name ?? "—"}
                    </p>
                  </>
                ) : r.kind === "cnh" ? (
                  <>
                    <p>
                      <span className="text-prime-muted">Nova:</span> <b>{p.cnh_number}</b> · {p.cnh_category} · vence {br(p.cnh_expires_at)}
                    </p>
                    <p>
                      <span className="text-prime-muted">Atual:</span> {r.driver?.cnh_number ?? "—"} · vence {br(r.driver?.cnh_expires_at)}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <span className="text-prime-muted">Nova chave:</span> <b>{p.pix_key}</b>
                    </p>
                    <p>
                      <span className="text-prime-muted">Atual:</span> {r.driver?.pix_key ?? "—"}
                    </p>
                  </>
                )}
              </div>
              {r.kind === "pix" ? <p className="mt-2 text-[12px] text-amber-800">Confirme a troca com o motorista por telefone antes de aprovar.</p> : null}
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy === r.id} onClick={() => void decide(r.id, "reject")} className="flex-1 rounded-lg px-3 py-2 text-sm ring-1 ring-prime-border">
                  Recusar
                </button>
                <button type="button" disabled={busy === r.id} onClick={() => void decide(r.id, "approve")} className="flex-[2] rounded-lg bg-[#111] px-3 py-2 text-sm font-semibold text-prime-gold">
                  {busy === r.id ? "Salvando…" : "Aprovar e atualizar cadastro"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
