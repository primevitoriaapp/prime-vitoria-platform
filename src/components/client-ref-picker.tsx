"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Ref = { ref: string; open: number; invoiced: number; first: string; last: string; passengers: string[]; invoices: number[] };
const dm = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/**
 * Campo da NR / referência do cliente. Digita exatamente como o cliente mandou
 * ou toca numa NR que já existe para incluir a corrida nela.
 */
export function ClientRefPicker({
  clientId,
  value,
  onChange,
  label = "NR / referência do cliente",
  className = ""
}: {
  clientId: string | null | undefined;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  className?: string;
}) {
  const [refs, setRefs] = useState<Ref[]>([]);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setRefs([]);
    if (!clientId) return;
    void fetchWithSupabaseSession(`/api/clients/${clientId}/open-refs`, {}, "admin")
      .then((r) => r.json())
      .then((j) => setRefs(j?.success ? (j.data.refs as Ref[]) : []))
      .catch(() => setRefs([]));
  }, [clientId]);

  const v = value.trim().toUpperCase();
  const key = (r: string) => r.toUpperCase().split("-")[0].replace(/^NR/, "");
  const match = v ? refs.find((r) => key(r.ref) === key(v)) : null;
  const filtered = v && !match ? refs.filter((r) => r.ref.includes(v.replace(/^NR/, ""))) : refs;
  const list = showAll ? filtered : filtered.slice(0, 6);

  return (
    <div className={`grid gap-1 text-sm ${className}`}>
      <span>{label}</span>
      <input
        className="rounded-xl border border-prime-border px-3 py-2 text-base uppercase md:text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex.: NR264874 (igual ao voucher do cliente)"
        autoCapitalize="characters"
      />
      {match ? (
        <p className="rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
          ✓ Entra na <b>{match.ref}</b>, junto com {match.open + match.invoiced} corrida(s) dessa NR
          {match.passengers.length ? ` (${match.passengers.join(", ")})` : ""}.
          {match.invoiced ? <b className="text-amber-800"> Atenção: essa NR já teve fatura (nº {match.invoices.join(", ")}). Esta corrida vai para uma fatura nova.</b> : null}
        </p>
      ) : v ? (
        <p className="text-xs text-prime-muted">NR nova para este cliente. Confira se está igual ao voucher.</p>
      ) : null}
      {clientId && list.length && !match ? (
        <div className="flex flex-wrap gap-1.5">
          {list.map((r) => (
            <button
              key={r.ref}
              type="button"
              onClick={() => onChange(r.ref)}
              className={`rounded-full px-2.5 py-1 text-left text-xs ring-1 ${r.open ? "bg-[#FBF6E9] ring-prime-gold" : "bg-white ring-prime-border"}`}
              title={r.passengers.join(", ")}
            >
              <b>{r.ref}</b> · {r.open ? `${r.open} a faturar` : `faturada${r.invoices.length ? ` nº ${r.invoices.join(", ")}` : ""}`} · {dm(r.last)}
              {r.passengers.length ? ` · ${r.passengers.slice(0, 2).join(", ")}` : ""}
            </button>
          ))}
          {filtered.length > 6 && !showAll ? (
            <button type="button" onClick={() => setShowAll(true)} className="text-xs font-semibold text-prime-gold-ink">
              ver todas ({filtered.length})
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
