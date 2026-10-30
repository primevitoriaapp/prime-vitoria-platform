"use client";

import { useEffect, useState } from "react";
import { PrimeLogoMark } from "@/components/prime-logo-mark";

/** Abertura do app (uma vez por sessão): fundo preto, logo girando e o nome da Prime. */
export function AppSplash() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("pv-splash") === "1";
      sessionStorage.setItem("pv-splash", "1");
    } catch {
      /* sem armazenamento: mostra mesmo assim */
    }
    if (seen) return;
    setShow(true);
    const t1 = setTimeout(() => setLeaving(true), 1900);
    const t2 = setTimeout(() => setShow(false), 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0B0B0B] transition-opacity duration-500"
      style={{ opacity: leaving ? 0 : 1 }}
      aria-hidden
    >
      <style>{`
        @keyframes pvSpin { 0% { transform: perspective(600px) rotateY(-180deg) scale(.6); opacity: 0 } 60% { transform: perspective(600px) rotateY(20deg) scale(1.05); opacity: 1 } 100% { transform: perspective(600px) rotateY(0) scale(1) } }
        @keyframes pvUp { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes pvLine { from { width: 0 } to { width: 120px } }
      `}</style>
      <div style={{ animation: "pvSpin 1.1s cubic-bezier(.2,.8,.2,1) both" }}>
        <PrimeLogoMark size={112} />
      </div>
      <p className="mt-5 text-2xl font-bold tracking-[0.12em]" style={{ color: "#fff", animation: "pvUp .6s .7s both" }}>
        PRIME <span style={{ color: "#C9A84C" }}>VITÓRIA</span>
      </p>
      <span className="mt-2 block h-px bg-[#C9A84C]" style={{ animation: "pvLine .6s 1s both" }} />
      <p className="mt-2 text-[11px] uppercase tracking-[0.32em]" style={{ color: "#C9A84C", animation: "pvUp .6s 1.1s both" }}>
        Transporte executivo
      </p>
    </div>
  );
}
