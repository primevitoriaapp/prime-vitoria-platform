"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type C = { id: string; title: string; status: "pendente" | "assinado" | "recusado"; created_at: string; signed_at: string | null; sign_url: string | null };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

/** Contratos para o motorista (app) ou para o gestor (portal): assinar e baixar. */
export function PartyContractsCard({ audience, devFallbackRole }: { audience: "motorista" | "cliente"; devFallbackRole?: "cliente" | "admin" }) {
  const [list, setList] = useState<C[] | null>(null);
  const api = audience === "motorista" ? "/api/drivers/me/contracts" : "/api/client/contracts";
  useEffect(() => {
    const req =
      audience === "motorista"
        ? fetch(api, { credentials: "include" })
        : fetchWithSupabaseSession(api, {}, devFallbackRole ?? "cliente");
    void req
      .then((r) => r.json())
      .then((j) => setList(j?.success ? (j.data as C[]) : []))
      .catch(() => setList([]));
  }, [api, audience, devFallbackRole]);
  if (!list || list.length === 0) return null;
  const pend = list.filter((c) => c.status === "pendente");
  return (
    <section className="rounded-3xl border border-[#ECE7DB] bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Contratos</h3>
        {pend.length ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{pend.length} para assinar</span> : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">Tudo assinado</span>}
      </div>
      <ul className="mt-2 grid gap-3">
        {list.map((c) => (
          <li key={c.id} className="rounded-2xl border border-[#F0ECE3] p-3">
            <p className="text-sm font-semibold">{c.title}</p>
            <p className={`text-xs ${c.status === "pendente" ? "font-semibold text-amber-800" : c.status === "assinado" ? "text-emerald-700" : "text-red-700"}`}>
              {c.status === "pendente" ? "Aguardando sua assinatura" : c.status === "assinado" ? `Assinado ${fmt(c.signed_at)}` : "Recusado"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {c.status === "pendente" && c.sign_url ? (
                <a href={c.sign_url} target="_blank" rel="noreferrer" className="rounded-xl bg-[#111] px-4 py-2 text-sm font-bold text-prime-gold">
                  ✍️ Abrir e assinar
                </a>
              ) : null}
              <a href={`${api}/${c.id}/file`} target="_blank" rel="noreferrer" className="rounded-xl border border-[#DDD5C2] px-4 py-2 text-sm">
                {c.status === "assinado" ? "Baixar PDF" : "Ler o contrato"}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
