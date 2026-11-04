"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { InAppNotificationsPanel } from "@/components/in-app-notifications-panel";
import { PushSetup } from "@/components/push-setup";
import { installSoundUnlock, playNotify } from "@/lib/client/sounds";

const BELL_SOUND_KEY = "prime.bell.sound";
function readBellSound(): boolean {
  try {
    return localStorage.getItem(BELL_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Sininho no topo de todas as telas do painel, com a lista de avisos ao clicar. */
export function NotificationsBell({
  tenantId,
  role
}: {
  tenantId: string | null;
  role: "admin" | "operador" | "financeiro";
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const lastUnread = useRef<number | null>(null);

  useEffect(() => installSoundUnlock(), []);

  const load = useCallback(async () => {
    const res = await fetchWithSupabaseSession("/api/notifications/in-app?page=1&pageSize=1", {}, role);
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { unreadCount?: number } };
    if (!res.ok || !json.success) return;
    const n = json.data?.unreadCount ?? 0;
    // Campainha quando chega aviso novo (não toca na primeira carga da tela).
    if (lastUnread.current != null && n > lastUnread.current && readBellSound()) playNotify();
    lastUnread.current = n;
    setUnread(n);
  }, [role]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  useTenantTableRefresh(tenantId, ["notifications", "notification_jobs"], load);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label={`Notificações${unread ? ` (${unread} novas)` : ""}`}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-prime-border bg-white text-base hover:border-prime-gold"
      >
        🔔
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-[18px] text-[#fff]">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(420px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-prime-border bg-white p-2 shadow-xl">
          <div className="mb-2">
            <PushSetup audience="central" compact />
          </div>
          <BellSoundToggle />
          <InAppNotificationsPanel tenantId={tenantId} devFallbackRole={role} compact />
        </div>
      ) : null}
    </div>
  );
}

function BellSoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(readBellSound()), []);
  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-prime-bg px-3 py-2 text-sm">
      <span>{on ? "🔊 Campainha dos avisos ligada" : "🔇 Campainha dos avisos desligada"}</span>
      <span className="flex gap-1">
        <button type="button" className="rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-prime-border hover:ring-prime-gold" onClick={() => playNotify()}>
          Testar
        </button>
        <button
          type="button"
          className="rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-prime-border hover:ring-prime-gold"
          onClick={() => {
            const next = !on;
            setOn(next);
            try {
              localStorage.setItem(BELL_SOUND_KEY, next ? "on" : "off");
            } catch {
              /* sem armazenamento */
            }
            if (next) playNotify();
          }}
        >
          {on ? "Desligar" : "Ligar"}
        </button>
      </span>
    </div>
  );
}
