"use client";

import { useEffect, useState } from "react";

type Data = { first_name: string; birthday: "today" | "yesterday" | null; alerts: { level: string; text: string }[] };

function seen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function markSeen(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* sem armazenamento: mostra de novo, sem problema */
  }
}

/** Parabéns no dia (ou no dia seguinte) e aviso de documento vencendo. */
export function DriverGreetingAlerts() {
  const [d, setD] = useState<Data | null>(null);
  const [showBday, setShowBday] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  useEffect(() => {
    void fetch("/api/drivers/me/alerts", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) return;
        const data = j.data as Data;
        setD(data);
        const day = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
        if (data.birthday && !seen(`bday-${day.slice(0, 4)}`)) setShowBday(true);
        else if (data.alerts.length && !seen(`docs-${day}`)) setShowDocs(true);
      })
      .catch(() => undefined);
  }, []);
  if (!d) return null;
  const year = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 4);
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  if (showBday) {
    return (
      <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-[#111] text-center shadow-2xl">
          <div className="px-6 pb-2 pt-8">
            <p className="text-6xl">🎉</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-prime-gold">Prime Vitória</p>
            <p className="mt-2 text-2xl font-bold" style={{ color: "#fff" }}>
              {d.birthday === "today" ? `Feliz aniversário, ${d.first_name}!` : `Parabéns pelo seu dia, ${d.first_name}!`}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>
              {d.birthday === "today"
                ? "Toda a equipe deseja muita saúde, paz e boas viagens. Obrigado por fazer parte do nosso time!"
                : "Ontem foi o seu aniversário e a gente não podia deixar passar. Muita saúde, paz e boas viagens. Obrigado por fazer parte do nosso time!"}
            </p>
          </div>
          <div className="p-5">
            <button
              type="button"
              onClick={() => {
                markSeen(`bday-${year}`);
                setShowBday(false);
                if (d.alerts.length && !seen(`docs-${day}`)) setShowDocs(true);
              }}
              className="w-full rounded-2xl bg-prime-gold py-3 text-base font-bold text-[#111]"
            >
              Obrigado! 🙌
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showDocs) {
    const bad = d.alerts.some((a) => a.level !== "atencao");
    return (
      <div className="fixed inset-0 z-[84] flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
          <p className={`text-lg font-bold ${bad ? "text-red-700" : "text-amber-800"}`}>{bad ? "⚠ Documento vencendo" : "Lembrete de documento"}</p>
          <ul className="mt-2 grid gap-1 text-[15px]">
            {d.alerts.map((a, i) => (
              <li key={i} className={a.level === "atencao" ? "text-[#111]" : "font-semibold text-red-700"}>
                • {a.text}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-[#6B6F76]">Renove e mande o documento novo para a central, para não ficar sem corridas.</p>
          <button
            type="button"
            onClick={() => {
              markSeen(`docs-${day}`);
              setShowDocs(false);
            }}
            className="mt-4 w-full rounded-2xl bg-[#111] py-3 text-base font-bold text-prime-gold"
          >
            Entendi
          </button>
        </div>
      </div>
    );
  }
  return null;
}
