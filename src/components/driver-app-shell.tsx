"use client";

import { DriverMessagePopup, DriverMessagesList } from "@/components/driver-messages-inbox";
import { DriverGreetingAlerts } from "@/components/driver-greeting-alerts";
import { PartyContractsCard } from "@/components/party-contracts-card";
import { useDriverPresenceBeacon } from "@/hooks/use-driver-presence-beacon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DriverWallet } from "@/components/driver-wallet";
import { DriverTripDeepLink } from "@/components/driver-trip-deep-link";
import { DriverTripsPanel } from "@/components/driver-trips-panel";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { DriverProfilePanel } from "@/components/driver-profile-panel";
import { PushSetup } from "@/components/push-setup";
import { InstallAppCard } from "@/components/install-app-card";
import { DriverHomeMap, MapSafe } from "@/components/driver-home-map";
import { DriverAccountEditor } from "@/components/driver-account-editor";
import type { Trip } from "@/lib/domain/types";

type DriverOption = { id: string; cpf: string; profile_name?: string | null };
type Me = {
  profile_name: string | null;
  full_name: string | null;
  photo_url: string | null;
  employment_type: "funcionario" | "parceiro";
  operational_status: string;
  vehicle: { model: string; plate: string; brand?: string | null; color?: string | null; category?: string | null } | null;
};
type Tab = "inicio" | "agenda" | "carteira" | "corridas" | "perfil";

type Props = {
  tenantId: string | null;
  mode: "motorista" | "admin";
  sessionDriverId?: string | null;
  initialDrivers?: DriverOption[];
};

const LIVE = ["dispatched", "accepted", "reassigned", "on_the_way", "arrived", "in_progress"];

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** 18h às 6h em Vitória: mapa escuro, como na tela da corrida. */
function isNight() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
  return h >= 18 || h < 6;
}

const TAB_TITLE: Record<Tab, string> = { inicio: "Início", agenda: "Minha agenda", carteira: "Minha carteira", corridas: "Histórico", perfil: "Meu perfil" };

const ICONS: Record<Tab, string> = {
  inicio: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  corridas: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  carteira: "M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2",
  agenda: "M4 6h16v14H4zM4 10h16M9 3v5M15 3v5",
  perfil: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6"
};
const TABS: { id: Tab; label: string }[] = [
  { id: "inicio", label: "Início" },
  { id: "agenda", label: "Agenda" },
  { id: "carteira", label: "Carteira" },
  { id: "corridas", label: "Histórico" },
  { id: "perfil", label: "Perfil" }
];

/** App do motorista: simples e funcional (início, corridas, agenda, perfil). */
export function DriverAppShell({ tenantId, mode, sessionDriverId, initialDrivers = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drivers, setDrivers] = useState(initialDrivers);
  const [me, setMe] = useState<Me | null>(null);
  // Aparece no mapa "Ao vivo" da central enquanto o app estiver aberto.
  useDriverPresenceBeacon(mode === "motorista");
  const [tab, setTab] = useState<Tab>("inicio");
  const [withTrips, setWithTrips] = useState<Record<string, number>>({});
  const [nextTrip, setNextTrip] = useState<Trip | null>(null);
  useEffect(() => {
    const a = searchParams.get("aba");
    if (a && TABS.some((t) => t.id === a)) setTab(a as Tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMe = useCallback(async () => {
    if (mode !== "motorista") return;
    const r = await fetch("/api/drivers/me", { credentials: "include" }).then((x) => x.json()).catch(() => null);
    if (r?.success) {
      setMe(r.data as Me);
      // O motorista fica sempre disponível: se estava offline, liga sozinho ao abrir o app.
      if ((r.data as Me).operational_status === "offline")
        void fetch("/api/drivers/operational-status", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "online" }) }).catch(() => undefined);
    }
  }, [mode]);
  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (mode !== "admin") return;
    if (initialDrivers.length === 0)
      void fetch("/api/drivers", { credentials: "include" })
        .then((r) => r.json())
        .then((j: { success?: boolean; data?: DriverOption[] }) => j.success && setDrivers(j.data ?? []))
        .catch(() => undefined);
    const from = new Date(Date.now() - 2 * 86400000).toISOString();
    fetch(`/api/trips?scheduledFrom=${encodeURIComponent(from)}&pageSize=300&sortDir=asc`, { credentials: "include" })
      .then((r) => r.json())
      .then((j: { data?: { items?: { driver_id?: string | null; operational_status: string }[] } }) => {
        const map: Record<string, number> = {};
        for (const t of j.data?.items ?? []) if (t.driver_id && LIVE.includes(t.operational_status)) map[t.driver_id] = (map[t.driver_id] ?? 0) + 1;
        setWithTrips(map);
      })
      .catch(() => undefined);
  }, [mode, initialDrivers.length]);

  const orderedDrivers = useMemo(() => [...drivers].sort((a, b) => (withTrips[b.id] ?? 0) - (withTrips[a.id] ?? 0)), [drivers, withTrips]);
  const selectedDriverId = useMemo(() => {
    if (mode === "motorista") return sessionDriverId ?? null;
    return searchParams.get("driver_id")?.trim() || orderedDrivers[0]?.id || null;
  }, [mode, sessionDriverId, searchParams, orderedDrivers]);

  const devRole = mode === "admin" ? "admin" : "motorista";
  const name = mode === "admin" ? (drivers.find((d) => d.id === selectedDriverId)?.profile_name ?? "Motorista") : (me?.profile_name || me?.full_name || "Motorista");
  function go(t: Tab) {
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-dvh bg-[#F1F0EC] pb-28 text-[#111]">
      <OperationalRealtimeBridge tenantId={tenantId} />
      {mode === "motorista" ? <DriverMessagePopup /> : null}
      {mode === "motorista" ? <DriverGreetingAlerts /> : null}
      <DriverTripDeepLink />

      {tab === "inicio" ? (
        <>
          <div className="fixed inset-x-0 top-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-0" style={isNight() ? { filter: "invert(0.92) hue-rotate(180deg) brightness(0.85) contrast(0.9)" } : undefined}>
            <MapSafe>
              <DriverHomeMap pickup={nextTrip?.origin_lat != null && nextTrip?.origin_lng != null ? { lat: Number(nextTrip.origin_lat), lng: Number(nextTrip.origin_lng) } : null} />
            </MapSafe>
          </div>
          <div className="pointer-events-none fixed inset-x-0 top-0 z-30 px-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
            <div className="pointer-events-auto mx-auto flex max-w-lg items-center justify-between gap-3 rounded-full bg-white/95 py-2 pl-2 pr-3 shadow-[0_8px_24px_rgba(0,0,0,0.15)] backdrop-blur">
              <div className="flex min-w-0 items-center gap-3">
                {me?.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={me.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-full border-2 border-prime-gold object-cover" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-prime-gold bg-[#111] text-lg font-semibold text-prime-gold">{name.charAt(0).toUpperCase()}</span>
                )}
                <div className="min-w-0 leading-tight">
                  <p className="text-xs text-[#5C6067]">{greeting()},</p>
                  <p className="truncate text-[15px] font-semibold text-[#111]">{name}</p>
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                {mode === "admin" ? "Prévia" : "Disponível"}
              </span>
            </div>
            {mode === "admin" ? (
              <select
                className="pointer-events-auto mx-auto mt-2 block w-full max-w-lg rounded-xl border border-[#DDD5C2] bg-white px-3 py-2 text-sm shadow"
                value={selectedDriverId ?? ""}
                onChange={(e) => router.replace(`/driver?driver_id=${e.target.value}`, { scroll: false })}
              >
                {orderedDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.profile_name?.trim() || `CPF ${d.cpf}`}
                    {withTrips[d.id] ? ` · ${withTrips[d.id]} corrida(s)` : ""}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </>
      ) : (
      <header className="rounded-b-[28px] bg-white px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-[#111] shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
          <div className="mx-auto max-w-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold tracking-[0.12em] text-[#111]">
                PRIME <span className="text-prime-gold">VITÓRIA</span>
              </p>
              {me?.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.photo_url} alt="" className="h-12 w-12 rounded-full border-2 border-prime-gold object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-prime-gold bg-[#1d1d1d] text-xl font-semibold text-prime-gold">
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-[#8A6A1F]">{TAB_TITLE[tab]}</p>
            <p className="mt-0.5 text-2xl font-extrabold leading-tight text-[#111]">
              {greeting()}, {name.split(" ")[0]}
            </p>
            {mode === "motorista" ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-[#3B3E44]">
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
                Disponível para os serviços
              </p>
            ) : (
              <label className="mt-3 block text-xs text-[#5C6067]">
                Vendo o app como:
                <select
                  className="mt-1 w-full rounded-xl border border-[#E5E0D4] bg-white px-3 py-2 text-sm text-[#111]"
                  value={selectedDriverId ?? ""}
                  onChange={(e) => router.replace(`/driver?driver_id=${e.target.value}`, { scroll: false })}
                >
                  {orderedDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.profile_name?.trim() || `CPF ${d.cpf}`}
                      {withTrips[d.id] ? ` · ${withTrips[d.id]} corrida(s)` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </header>
      )}

      <main className={`relative mx-auto max-w-lg space-y-5 px-4 pt-5 ${tab === "inicio" ? "h-0 overflow-visible !pt-0" : ""}`}>
        <DriverTripsPanel
          key={`trips-${selectedDriverId ?? "none"}`}
          tenantId={tenantId}
          driverIdFilter={selectedDriverId ?? sessionDriverId ?? null}
          devFallbackRole={devRole}
          view={tab === "agenda" ? "agenda" : tab === "corridas" ? "historico" : "inicio"}
          onSeeAll={() => go("agenda")}
          onGoHome={() => setTab("inicio")}
          onPrimaryTrip={setNextTrip}
          hidden={tab === "perfil" || tab === "carteira"}
        />

        {tab === "carteira" ? (
          mode === "motorista" ? (
            <section className="space-y-2">
              <DriverWallet />
            </section>
          ) : (
            <p className="rounded-3xl bg-white p-4 text-sm text-[#6B6F76]">A carteira aparece quando o próprio motorista entra com CPF e PIN.</p>
          )
        ) : null}

        {tab === "perfil" ? (
          <section className="space-y-4">
            {mode === "motorista" ? (
              <>
                <DriverProfilePanel devFallbackRole={devRole} />
                <PartyContractsCard audience="motorista" />
                <DriverMessagesList />
                <InstallAppCard />
                <DriverAccountEditor />
                <ChangePinCard />
                <PushSetup audience="motorista" />
              </>
            ) : (
              <p className="rounded-3xl bg-white p-4 text-sm text-[#6B6F76]">O perfil aparece quando o próprio motorista entra com CPF e PIN.</p>
            )}
            <p className="text-center text-xs text-[#6B6F76]">
              <a href="/privacidade" className="underline">
                Termos de uso e privacidade
              </a>
            </p>
          </section>
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#ECE7DB] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Navegação do motorista">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => go(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 py-2.5 text-xs ${tab === t.id ? "font-bold text-[#111]" : "text-[#6B6F76]"}`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={tab === t.id ? "#B08D35" : "currentColor"} strokeWidth={tab === t.id ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={ICONS[t.id]} />
                </svg>
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** O motorista troca o próprio PIN. */
function ChangePinCard() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [nxt, setNxt] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const field = "w-full rounded-xl border border-[#DDD5C2] bg-white px-4 py-3 text-center text-2xl tracking-[0.5em]";
  async function save() {
    setBusy(true);
    const r = await fetch("/api/drivers/me/pin", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: cur, next: nxt }) });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (r.ok && j.success) {
      setMsg({ ok: true, text: "PIN trocado. Use o novo PIN na próxima vez que entrar." });
      setOpen(false);
      setCur("");
      setNxt("");
    } else setMsg({ ok: false, text: j.error?.message ?? "Não foi possível trocar o PIN." });
  }
  return (
    <div className="rounded-3xl border border-[#ECE7DB] bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between">
        <p className="font-semibold">PIN de acesso</p>
        {!open ? (
          <button type="button" className="text-sm font-semibold text-prime-gold" onClick={() => setOpen(true)}>
            Trocar PIN
          </button>
        ) : null}
      </div>
      {msg ? <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
      {open ? (
        <div className="mt-3 grid gap-3">
          <label className="text-sm text-[#555]">
            PIN atual
            <input className={field} type="password" inputMode="numeric" maxLength={4} value={cur} onChange={(e) => setCur(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="text-sm text-[#555]">
            Novo PIN
            <input className={field} type="password" inputMode="numeric" maxLength={4} value={nxt} onChange={(e) => setNxt(e.target.value.replace(/\D/g, ""))} />
          </label>
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-xl border border-[#DDD5C2] px-3 py-2.5 text-sm" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="button" disabled={busy || cur.length !== 4 || nxt.length !== 4} className="flex-[2] rounded-xl bg-[#111] px-3 py-2.5 text-sm font-semibold text-prime-gold disabled:opacity-50" onClick={() => void save()}>
              {busy ? "Salvando…" : "Salvar novo PIN"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
