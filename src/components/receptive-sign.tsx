"use client";

import { useEffect, useState } from "react";

/** Mostra o botão quando a corrida pede placa/receptivo ou o embarque é em aeroporto. */
export function needsReceptiveSign(trip: { service_extras?: string[] | null; origin_text?: string | null }): boolean {
  const ex = trip.service_extras ?? [];
  if (ex.includes("placa_nome") || ex.includes("receptivo")) return true;
  return /aeroporto|airport|\bVIX\b|rodovi[aá]ria/i.test(String(trip.origin_text ?? ""));
}

/**
 * Placa de receptivo na tela do celular: logo da Prime e o nome do passageiro bem grande.
 * O motorista abre, vira o celular e mostra no desembarque.
 */
export function ReceptiveSignButton({ name, className }: { name: string | null | undefined; className?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState((name ?? "").split(",")[0].trim());
  const [editing, setEditing] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    if (!open) return;
    // Mantém a tela acesa enquanto a placa está aberta (quando o celular permite).
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => undefined);
    return () => {
      void lock?.release().catch(() => undefined);
    };
  }, [open]);

  const shown = text.trim() || "Passageiro";
  // Tamanho da letra pelo comprimento do nome (cabe na largura).
  const size = `min(${Math.max(9, Math.min(22, Math.round(190 / Math.max(shown.length, 6))))}vw, 30vh)`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-prime-gold bg-white px-4 py-3 text-base font-bold text-[#111]"}
      >
        🪧 Abrir placa de receptivo
      </button>
      {open ? (
        <div className="fixed inset-0 z-[200] flex flex-col bg-white" role="dialog" aria-label="Placa de receptivo">
          <div className="flex flex-1 flex-col items-center justify-center gap-[3vh] px-[4vw] text-center" onClick={() => !editing && setEditing(false)}>
            {logoOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/api/public/brand-logo" alt="Prime Vitória" onError={() => setLogoOk(false)} style={{ height: "min(18vh, 22vw)", width: "auto", objectFit: "contain" }} />
            ) : (
              <div style={{ textAlign: "center", lineHeight: 1.1 }}>
                <div style={{ fontSize: "min(7vw, 8vh)", fontWeight: 800, letterSpacing: "0.08em", color: "#111" }}>PRIME VITÓRIA</div>
                <div style={{ fontSize: "min(2.6vw, 3vh)", fontWeight: 700, letterSpacing: "0.3em", color: "#C9A84C" }}>TRANSPORTE EXECUTIVO</div>
              </div>
            )}
            <div style={{ height: 4, width: "40vw", background: "#C9A84C", borderRadius: 2 }} />
            <p style={{ fontSize: size, lineHeight: 1.05, fontWeight: 800, color: "#111", letterSpacing: "-0.01em", wordBreak: "break-word" }}>{shown}</p>
            <p style={{ fontSize: "min(3.2vw, 3.5vh)", letterSpacing: "0.25em", color: "#7A6A3A", fontWeight: 700 }}>PRIME VITÓRIA · TRANSPORTE EXECUTIVO</p>
          </div>
          <div className="flex items-center gap-2 border-t border-[#EEE] bg-[#FAFAF7] px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {editing ? (
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => setEditing(false)}
                className="flex-1 rounded-lg border border-[#DDD] px-3 py-2 text-base"
                placeholder="Nome na placa"
              />
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="flex-1 rounded-lg px-3 py-2 text-left text-sm text-[#555] ring-1 ring-[#DDD]">
                ✎ Mudar o nome (ex.: Sra. Noeli Sartori)
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-[#C9A84C]">
              Fechar
            </button>
          </div>
          <p className="pointer-events-none absolute left-0 right-0 top-2 text-center text-xs text-[#AAA] landscape:hidden">Vire o celular para a placa ficar maior</p>
        </div>
      ) : null}
    </>
  );
}
