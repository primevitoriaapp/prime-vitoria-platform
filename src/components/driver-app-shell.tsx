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
import { BrandLogo } from "@/components/brand-logo";
import { DriverBottomNav } from "@/components/driver-bottom-nav";
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
    <div className="driver-theme min-h-screen bg-[#1A1A1A] text-[#F5F5F5]">
      <OperationalRealtimeBridge tenantId={tenantId} />
      <header className="border-b border-[#3A3A3E] bg-[#1A1A1A]">
        <div className="mx-auto flex max-w-lg flex-wrap items-center justify-between gap-4 px-4 py-4 md:max-w-3xl lg:max-w-5xl">
          <BrandLogo subtitle="MOTORISTA" compact />
          {mode === "admin" ? (
            <label className="grid gap-1 text-xs text-prime-muted">
              <span>Motorista em preview</span>
              <select
                className="prime-input min-w-[12rem] py-1.5"
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
            <span className="rounded-full border border-prime-border px-2 py-0.5 text-xs text-prime-muted">PWA</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-6 px-4 py-6 pb-28 md:max-w-3xl md:pb-8 md:px-6 lg:max-w-5xl lg:px-8">
        {mode === "admin" && !selectedDriverId ? (
          <p className="rounded-lg border border-prime-gold/30 bg-prime-gold/10 px-3 py-2 text-sm text-prime-text">
            Selecione um motorista cadastrado para simular o app e testar aceitar, iniciar, cheguei e finalizar.
          </p>
        ) : null}

        <StagingSmokeHints variant="light" />
        <DriverPushStatusBanner
          driverId={mode === "admin" ? selectedDriverId : sessionDriverId}
          devFallbackRole={devRole}
        />
        <DriverTripDeepLink />

        <section id="corridas">
          <DriverTripsPanel
            key={`trips-${driverKey}`}
            tenantId={tenantId}
            driverIdFilter={mode === "admin" ? selectedDriverId : null}
            devFallbackRole={devRole}
          />
        </section>

        <section className="driver-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#C9A84C]">Ofertas da central</h2>
          <p className="mt-1 text-xs text-[#AAAAAA]">Aceite ofertas abertas como o motorista seleccionado.</p>
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

        <section id="carteira" className="driver-card scroll-mt-6 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#AAAAAA]">Pagamentos</h2>
          <div className="mt-3">
            <DriverPayablesPanel
              tenantId={tenantId}
              driverIdFilter={mode === "admin" ? selectedDriverId : null}
              devFallbackRole={devRole}
            />
          </div>
        </section>

        {mode === "motorista" ? (
          <section id="push-setup" className="driver-card scroll-mt-6 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#AAAAAA]">Notificações push</h2>
            <div className="mt-3">
              <DriverPushRegister variant="light" />
            </div>
          </section>
        ) : null}

        {mode === "admin" ? (
          <details className="driver-card p-4">
            <summary className="cursor-pointer text-sm font-medium text-[#AAAAAA]">Ferramentas avançadas (staging)</summary>
            <div className="mt-4">
              <DriverConsole />
            </div>
          </details>
        ) : null}
      </main>
      {mode === "motorista" ? <DriverBottomNav /> : null}
    </div>
  );
}
