"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DriverWallet } from "@/components/driver-wallet";
import { DriverTripDeepLink } from "@/components/driver-trip-deep-link";
import { DriverTripsPanel } from "@/components/driver-trips-panel";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { DriverProfilePanel } from "@/components/driver-profile-panel";
import { PushSetup } from "@/components/push-setup";
import { InstallAppCard } from "@/components/install-app-card";

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
  const [tab, setTab] = useState<Tab>("inicio");
  const [statusBusy, setStatusBusy] = useState(false);
  const [withTrips, setWithTrips] = useState<Record<string, number>>({});

  const loadMe = useCallback(async () => {
    if (mode !== "motorista") return;
    const r = await fetch("/api/drivers/me", { credentials: "include" }).then((x) => x.json()).catch(() => null);
    if (r?.success) setMe(r.data as Me);
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
  const online = me?.operational_status && me.operational_status !== "offline";

  async function toggleStatus() {
    if (mode !== "motorista" || !me) return;
    setStatusBusy(true);
    await fetch("/api/drivers/operational-status", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: online ? "offline" : "online" })
    }).catch(() => undefined);
    setStatusBusy(false);
    void loadMe();
  }

  function go(t: Tab) {
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-dvh bg-[#F1F0EC] pb-28 text-[#111]">
      <OperationalRealtimeBridge tenantId={tenantId} />
      <DriverTripDeepLink />

      <header className="rounded-b-[2rem] bg-[#111] px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))] text-[#fff]">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold tracking-[0.08em]" style={{ color: "#fff" }}>
              PRIME <span className="text-prime-gold">VITÓRIA</span>
            </p>
            {me?.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.photo_url} alt="" className="h-14 w-14 rounded-full border-2 border-prime-gold object-cover" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-prime-gold bg-[#1d1d1d] text-xl font-semibold text-prime-gold">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <p className="mt-4 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
            {greeting()}, motorista
          </p>
          <p className="text-2xl font-bold leading-tight" style={{ color: "#fff" }}>
            {name}
          </p>
          {mode === "motorista" ? (
            <button type="button" disabled={statusBusy} onClick={() => void toggleStatus()} className="mt-2 flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
              <span className={`h-3 w-3 rounded-full ${online ? "bg-emerald-400" : "bg-gray-500"}`} />
              {online ? "Disponível para os serviços agendados" : "Offline · toque para ficar disponível"}
            </button>
          ) : (
            <label className="mt-3 block text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
              Vendo o app como:
              <select
                className="mt-1 w-full rounded-xl border border-white/20 bg-[#1d1d1d] px-3 py-2 text-sm text-[#fff]"
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

      <main className="mx-auto max-w-lg space-y-5 px-4 pt-5">
        {tab === "inicio" ? (
          <>
            {mode === "motorista" ? <InstallAppCard /> : null}
            {mode === "motorista" ? <PushSetup audience="motorista" /> : null}
            {mode === "motorista" ? (
              <section className="space-y-2">
                <div className="flex items-end justify-between px-1">
                  <h2 className="text-lg font-semibold">Meu veículo</h2>
                  <span className="text-sm text-[#8A8A8A]">Veículo em uso</span>
                </div>
                <div className="flex items-center gap-4 rounded-3xl border border-[#ECE7DB] bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F6EEDC] text-2xl" aria-hidden>
                    🚘
                  </span>
                  {me?.vehicle ? (
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{[me.vehicle.brand, me.vehicle.model].filter(Boolean).join(" ")}</p>
                      <p className="text-sm text-[#8A8A8A]">{[me.vehicle.color, me.vehicle.plate].filter(Boolean).join(" · ")}</p>
                    </div>
                  ) : (
                    <p className="flex-1 text-sm text-[#8A8A8A]">Nenhum carro vinculado. Peça para a central cadastrar o veículo que você usa.</p>
                  )}
                  {me?.vehicle ? <span className="rounded-full bg-[#EAF6EF] px-3 py-1 text-xs font-semibold text-[#1F7A4C]">Ativo</span> : null}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        <DriverTripsPanel
          key={`trips-${selectedDriverId ?? "none"}`}
          tenantId={tenantId}
          driverIdFilter={selectedDriverId ?? sessionDriverId ?? null}
          devFallbackRole={devRole}
          view={tab === "agenda" ? "agenda" : tab === "corridas" ? "historico" : "inicio"}
          onSeeAll={() => go("agenda")}
          hidden={tab === "perfil" || tab === "carteira"}
        />

        {tab === "carteira" ? (
          mode === "motorista" ? (
            <section className="space-y-2">
              <h2 className="px-1 text-lg font-semibold">Minha carteira</h2>
              <DriverWallet />
            </section>
          ) : (
            <p className="rounded-3xl bg-white p-4 text-sm text-[#8A8A8A]">A carteira aparece quando o próprio motorista entra com CPF e PIN.</p>
          )
        ) : null}

        {tab === "perfil" ? (
          <section className="space-y-4">
            {mode === "motorista" ? (
              <>
                <DriverProfilePanel devFallbackRole={devRole} />
                <ChangePinCard />
                <PushSetup audience="motorista" />
              </>
            ) : (
              <p className="rounded-3xl bg-white p-4 text-sm text-[#8A8A8A]">O perfil aparece quando o próprio motorista entra com CPF e PIN.</p>
            )}
            <p className="text-center text-xs text-[#8A8A8A]">
              <a href="/privacidade" className="underline">
                Termos de uso e privacidade
              </a>
            </p>
          </section>
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E7E2D7] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Navegação do motorista">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => go(t.id)}
                className={`flex w-full flex-col items-center gap-1 py-2.5 text-xs ${tab === t.id ? "font-semibold text-[#111]" : "text-[#8A8A8A]"}`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={tab === t.id ? "#C9A84C" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
