"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DriverConsole } from "@/components/driver-console";
import { DriverOffersPanel } from "@/components/driver-offers-panel";
import { DriverOperationalStatusPanel } from "@/components/driver-operational-status-panel";
import { DriverPayablesPanel } from "@/components/driver-payables-panel";
import { DriverPushRegister } from "@/components/driver-push-register";
import { DriverPushStatusBanner } from "@/components/driver-push-status-banner";
import { DriverTripDeepLink } from "@/components/driver-trip-deep-link";
import { DriverTripsPanel } from "@/components/driver-trips-panel";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { StagingSmokeHints } from "@/components/staging-smoke-hints";

type DriverOption = {
  id: string;
  cpf: string;
  profile_name?: string | null;
};

type Props = {
  tenantId: string | null;
  mode: "motorista" | "admin";
  sessionDriverId?: string | null;
  initialDrivers?: DriverOption[];
};

export function DriverAppShell({ tenantId, mode, sessionDriverId, initialDrivers = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drivers, setDrivers] = useState(initialDrivers);

  const selectedDriverId = useMemo(() => {
    if (mode === "motorista") return sessionDriverId ?? null;
    const fromUrl = searchParams.get("driver_id")?.trim();
    if (fromUrl) return fromUrl;
    return drivers[0]?.id ?? null;
  }, [mode, sessionDriverId, searchParams, drivers]);

  const reloadDrivers = useCallback(async () => {
    if (mode !== "admin") return;
    const res = await fetch("/api/drivers", { credentials: "include" });
    const json = (await res.json()) as { success?: boolean; data?: DriverOption[] };
    if (res.ok && json.success) setDrivers(json.data ?? []);
  }, [mode]);

  useEffect(() => {
    if (mode === "admin" && initialDrivers.length === 0) void reloadDrivers();
  }, [mode, initialDrivers.length, reloadDrivers]);

  function onDriverChange(nextId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextId) params.set("driver_id", nextId);
    else params.delete("driver_id");
    router.replace(`/driver?${params.toString()}`, { scroll: false });
  }

  const devRole = mode === "admin" ? "admin" : "motorista";
  const driverKey = selectedDriverId ?? "none";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <OperationalRealtimeBridge tenantId={tenantId} />
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-lg flex-wrap items-center justify-between gap-4 px-4 py-4 md:max-w-3xl lg:max-w-5xl">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-500/90">Prime Vitória</p>
            <h1 className="text-lg font-semibold text-white">
              {mode === "admin" ? "App motorista (teste admin)" : "Motorista"}
            </h1>
          </div>
          {mode === "admin" ? (
            <label className="grid gap-1 text-xs text-slate-400">
              <span>Motorista em preview</span>
              <select
                className="min-w-[12rem] rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                value={selectedDriverId ?? ""}
                onChange={(e) => onDriverChange(e.target.value)}
              >
                {drivers.length === 0 ? <option value="">— carregando —</option> : null}
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.profile_name?.trim() || `CPF ${d.cpf}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">PWA</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-6 px-4 py-6 pb-24 md:max-w-3xl md:px-6 lg:max-w-5xl lg:px-8">
        {mode === "admin" && !selectedDriverId ? (
          <p className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            Selecione um motorista cadastrado para simular o app e testar aceitar, iniciar, cheguei e finalizar.
          </p>
        ) : null}

        <StagingSmokeHints variant="dark" />
        <DriverPushStatusBanner
          driverId={mode === "admin" ? selectedDriverId : sessionDriverId}
          devFallbackRole={devRole}
        />
        <DriverTripDeepLink />

        <DriverTripsPanel
          key={`trips-${driverKey}`}
          tenantId={tenantId}
          driverIdFilter={mode === "admin" ? selectedDriverId : null}
          devFallbackRole={devRole}
        />

        <section className="rounded-xl border border-violet-900/40 bg-slate-900/40 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-300/90">Ofertas da central</h2>
          <p className="mt-1 text-xs text-slate-500">Aceite ofertas abertas como o motorista seleccionado.</p>
          <div className="mt-3">
            <DriverOffersPanel
              key={`offers-${driverKey}`}
              tenantId={tenantId}
              driverId={mode === "admin" ? selectedDriverId : null}
              devFallbackRole={devRole}
            />
          </div>
        </section>

        <DriverOperationalStatusPanel
          key={`status-${driverKey}`}
          driverId={mode === "admin" ? selectedDriverId : null}
          devFallbackRole={devRole}
        />

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pagamentos</h2>
          <div className="mt-3 [&_.card]:border-slate-700 [&_.card]:bg-slate-900 [&_input]:border-slate-600 [&_input]:bg-slate-800 [&_input]:text-slate-100">
            <DriverPayablesPanel
              tenantId={tenantId}
              driverIdFilter={mode === "admin" ? selectedDriverId : null}
              devFallbackRole={devRole}
            />
          </div>
        </section>

        {mode === "motorista" ? (
          <section id="push-setup" className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 scroll-mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Notificações push</h2>
            <div className="mt-3 [&_.card]:border-0 [&_.card]:bg-transparent [&_.card]:p-0 [&_input]:border-slate-600 [&_input]:bg-slate-800 [&_input]:text-slate-100">
              <DriverPushRegister variant="dark" />
            </div>
          </section>
        ) : null}

        {mode === "admin" ? (
          <details className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-400">Ferramentas avançadas (staging)</summary>
            <div className="mt-4 [&_.card]:border-slate-700 [&_.card]:bg-slate-900 [&_input]:border-slate-600 [&_input]:bg-slate-800 [&_input]:text-slate-100">
              <DriverConsole />
            </div>
          </details>
        ) : null}
      </main>
    </div>
  );
}
