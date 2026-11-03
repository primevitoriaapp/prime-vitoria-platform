"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const SOUND_PREF_KEY = "prime.alerts.sound";

function soundOn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Topo do painel: pedidos dos motoristas (foto, dados, CNH, carro, PIX) esperando aprovação. Toca quando chega um novo. */
export function DriverRequestsAlert() {
  const [count, setCount] = useState(0);
  const seen = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    const unlock = () => {
      try {
        if (!audio.current) {
          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (Ctx) audio.current = new Ctx();
        }
        void audio.current?.resume();
      } catch {
        /* sem áudio */
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    const chime = () => {
      const ctx = audio.current;
      if (!ctx || ctx.state !== "running" || !soundOn()) return;
      const now = ctx.currentTime;
      [0, 0.5].forEach((base) =>
        [523.25, 783.99].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          const at = now + base + i * 0.16;
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
          osc.connect(gain).connect(ctx.destination);
          osc.start(at);
          osc.stop(at + 0.35);
        })
      );
    };

    let stop = false;
    const check = async () => {
      try {
        const r = await fetch("/api/driver-requests", { credentials: "include" });
        const j = (await r.json()) as { success?: boolean; data?: { id: string }[] };
        if (stop || !j?.success) return;
        const ids = (j.data ?? []).map((x) => x.id);
        setCount(ids.length);
        if (seen.current) {
          const fresh = ids.filter((id) => !seen.current!.has(id));
          if (fresh.length) {
            chime();
            try {
              if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
                new Notification("Pedido de motorista para aprovar", { body: "Abra Motoristas para conferir.", tag: "driver-requests" });
              }
            } catch {
              /* sem notificação do navegador */
            }
          }
        }
        seen.current = new Set(ids);
      } catch {
        /* sem rede: tenta no próximo ciclo */
      }
    };
    void check();
    const t = window.setInterval(() => void check(), 30_000);
    return () => {
      stop = true;
      window.clearInterval(t);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  if (!count) return null;
  return (
    <Link
      href="/drivers#pedidos"
      className="rounded-full border border-amber-500 bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 motion-safe:animate-pulse"
      title="Pedidos dos motoristas para aprovar"
    >
      🪪 {count} pedido{count > 1 ? "s" : ""} de motorista
    </Link>
  );
}
