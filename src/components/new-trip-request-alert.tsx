"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { shortPlaceLabel } from "@/lib/trips/format-place-label";

type Props = {
  /** Tenant da sessão; sem tenant não subscreve. */
  tenantId: string | null;
};

type TripInsertRow = {
  id: string;
  operational_status?: string | null;
  scheduled_at?: string | null;
  origin_text?: string | null;
  destination_text?: string | null;
  passenger_name?: string | null;
};

type PendingAlert = {
  id: string;
  scheduledAt: string | null;
  origin: string | null;
  destination: string | null;
  passenger: string | null;
};

const SOUND_PREF_KEY = "prime.alerts.sound";
const BASE_TITLE_FALLBACK = "Prime Vitória";

function readSoundPref(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeSoundPref(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, on ? "on" : "off");
  } catch {
    /* navegador sem armazenamento: só vale nesta aba */
  }
}

/**
 * Aviso de corrida nova solicitada (portal do cliente ou site):
 * som curto, cartão no canto da tela, título da aba piscando e
 * notificação do navegador quando permitida. Vale em todas as páginas do painel.
 */
export function NewTripRequestAlert({ tenantId }: Props) {
  const [alerts, setAlerts] = useState<PendingAlert[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const audioRef = useRef<AudioContext | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const baseTitleRef = useRef<string>(BASE_TITLE_FALLBACK);

  useEffect(() => {
    setSoundOn(readSoundPref());
    baseTitleRef.current = document.title || BASE_TITLE_FALLBACK;
  }, []);

  // O navegador só libera áudio depois de um clique do operador na página.
  useEffect(() => {
    const unlock = () => {
      try {
        if (!audioRef.current) {
          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (Ctx) audioRef.current = new Ctx();
        }
        void audioRef.current?.resume();
      } catch {
        /* sem áudio neste navegador */
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const playChime = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    // Dois toques curtos (Mi5 → Lá5), volume baixo.
    [
      { freq: 659.25, at: 0 },
      { freq: 880, at: 0.18 }
    ].forEach(({ freq, at }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.25, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.4);
    });
  }, []);

  const showBrowserNotification = useCallback((alert: PendingAlert) => {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      if (document.visibilityState === "visible") return;
      const when = alert.scheduledAt ? formatBrDateTime(alert.scheduledAt) : "";
      const n = new Notification("Nova corrida solicitada", {
        body: [when, alert.origin && alert.destination ? `${alert.origin} → ${alert.destination}` : ""]
          .filter(Boolean)
          .join("\n"),
        tag: `trip-${alert.id}`
      });
      n.onclick = () => {
        window.focus();
        window.location.href = `/agenda?trip=${alert.id}`;
      };
    } catch {
      /* notificação do navegador indisponível */
    }
  }, []);

  // Título da aba piscando enquanto houver aviso não visto.
  useEffect(() => {
    if (!alerts.length) {
      document.title = baseTitleRef.current;
      return;
    }
    let on = false;
    const label = alerts.length === 1 ? "Nova corrida" : `${alerts.length} novas corridas`;
    const timer = window.setInterval(() => {
      on = !on;
      document.title = on ? `(${alerts.length}) ${label}` : baseTitleRef.current;
    }, 1000);
    return () => {
      window.clearInterval(timer);
      document.title = baseTitleRef.current;
    };
  }, [alerts.length]);

  useEffect(() => {
    if (!tenantId) return;
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null = null;
    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;

    try {
      supabase = createSupabaseBrowserClient();
      channel = supabase
        .channel(`ops-new-trip-requests-${tenantId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "trips", filter: `tenant_id=eq.${tenantId}` },
          (payload) => {
            const row = payload.new as TripInsertRow;
            if (!row?.id || row.operational_status !== "requested") return;
            if (seenRef.current.has(row.id)) return;
            seenRef.current.add(row.id);

            const alert: PendingAlert = {
              id: row.id,
              scheduledAt: row.scheduled_at ?? null,
              origin: row.origin_text ? shortPlaceLabel(row.origin_text) : null,
              destination: row.destination_text ? shortPlaceLabel(row.destination_text) : null,
              passenger: row.passenger_name ?? null
            };
            setAlerts((prev) => [alert, ...prev].slice(0, 5));
            if (readSoundPref()) playChime();
            showBrowserNotification(alert);
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("[new-trip-alert] realtime indisponível", err);
    }

    return () => {
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [tenantId, playChime, showBrowserNotification]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    writeSoundPref(next);
    if (next) {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          void Notification.requestPermission();
        }
      } catch {
        /* sem notificação do navegador */
      }
      playChime();
    }
  };

  const dismiss = (id: string) => setAlerts((prev) => prev.filter((a) => a.id !== id));

  if (!tenantId) return null;

  return (
    <>
      <button
        type="button"
        onClick={toggleSound}
        className="rounded-full border border-prime-border bg-prime-bg px-3 py-1 text-xs text-prime-text hover:border-prime-gold"
        title={soundOn ? "Som de corrida nova ligado. Clique para desligar." : "Som de corrida nova desligado. Clique para ligar."}
        aria-pressed={soundOn}
      >
        {soundOn ? "🔔 Som ligado" : "🔕 Som desligado"}
      </button>

      {alerts.length ? (
        <div
          className="fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
          role="status"
          aria-live="polite"
        >
          {alerts.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border-2 border-prime-gold bg-prime-card p-4 text-prime-text shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold">Nova corrida solicitada</p>
                <button
                  type="button"
                  onClick={() => dismiss(a.id)}
                  className="text-xs text-prime-muted hover:text-prime-text"
                  aria-label="Fechar aviso"
                >
                  ✕
                </button>
              </div>
              {a.scheduledAt ? (
                <p className="mt-1 text-sm">{formatBrDateTime(a.scheduledAt)}</p>
              ) : null}
              {a.origin || a.destination ? (
                <p className="mt-1 text-sm text-prime-muted">
                  {a.origin ?? "—"} → {a.destination ?? "—"}
                </p>
              ) : null}
              {a.passenger ? <p className="mt-1 text-xs text-prime-muted">Passageiro: {a.passenger}</p> : null}
              <Link
                href={`/agenda?trip=${a.id}`}
                onClick={() => dismiss(a.id)}
                className="mt-3 inline-block rounded-lg bg-prime-gold px-3 py-1.5 text-sm font-medium text-prime-text hover:bg-prime-gold-hover"
              >
                Abrir na agenda
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
