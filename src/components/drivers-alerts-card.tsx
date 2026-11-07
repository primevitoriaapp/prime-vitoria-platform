"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Data = {
  birthdays: { driver_id: string; name: string; phone: string | null; when: string; age: number }[];
  documents: { driver_id: string; name: string; phone: string | null; alerts: { level: string; text: string }[] }[];
  incomplete: { driver_id: string; name: string; missing: string[] }[];
  total: number;
};

const wa = (phone: string | null, text: string) =>
  phone ? `https://wa.me/55${phone.replace(/\D/g, "").replace(/^55/, "")}?text=${encodeURIComponent(text)}` : null;
const first = (n: string) => n.split(" ")[0];

/** Início do painel: aniversariantes, documentos vencendo e cadastros incompletos. */
export function DriversAlertsCard() {
  const [d, setD] = useState<Data | null>(null);
  const [showIncomplete, setShowIncomplete] = useState(false);
  useEffect(() => {
    void fetchWithSupabaseSession("/api/drivers/alerts", {}, "admin")
      .then((r) => r.json())
      .then((j) => j?.success && setD(j.data as Data))
      .catch(() => undefined);
  }, []);
  if (!d || (!d.birthdays.length && !d.documents.length && !d.incomplete.length)) return null;
  return (
    <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-prime-gold-ink">Motoristas</p>
      {d.birthdays.map((b) => {
        const msg =
          b.when === "ontem"
            ? `Oi ${first(b.name)}! Ontem foi seu aniversário e a equipe Prime Vitória não podia deixar passar: parabéns! Muita saúde, paz e boas viagens. 🎉`
            : `Feliz aniversário, ${first(b.name)}! 🎉 Toda a equipe Prime Vitória deseja muita saúde, paz e boas viagens. Obrigado por fazer parte do nosso time!`;
        const link = wa(b.phone, msg);
        return (
          <div key={b.driver_id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 ${b.when === "hoje" ? "bg-[#FBF3E0]" : "bg-prime-bg"}`}>
            <p className="text-sm">
              🎂 <b>{b.name}</b> {b.when === "hoje" ? "faz aniversário HOJE" : b.when === "ontem" ? "fez aniversário ontem" : `faz aniversário ${b.when}`} ({b.age} anos)
            </p>
            {link && (b.when === "hoje" || b.when === "ontem") ? (
              <a href={link} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-[#fff]">
                Mandar parabéns
              </a>
            ) : null}
          </div>
        );
      })}
      {d.documents.map((x) => (
        <div key={x.driver_id} className="rounded-xl bg-prime-bg px-3 py-2 text-sm">
          <p className="font-semibold">{x.name}</p>
          {x.alerts.map((a, i) => (
            <p key={i} className={a.level === "vencido" ? "font-semibold text-red-700" : a.level === "urgente" ? "text-red-600" : "text-amber-700"}>
              {a.level === "vencido" ? "⛔" : "⚠"} {a.text}
            </p>
          ))}
        </div>
      ))}
      {d.incomplete.length ? (
        <div className="text-sm">
          <button type="button" className="text-left text-amber-800" onClick={() => setShowIncomplete((v) => !v)}>
            📝 {d.incomplete.length} de {d.total} cadastros sem dados para os avisos de aniversário e vencimento {showIncomplete ? "▲" : "▼"}
          </button>
          {showIncomplete ? (
            <ul className="mt-1 grid gap-1 text-xs">
              {d.incomplete.map((x) => (
                <li key={x.driver_id}>
                  <a href={`/drivers?ficha=${x.driver_id}`} className="font-semibold underline">
                    {x.name}
                  </a>
                  : falta {x.missing.join(", ")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
