"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClientRequestConsole } from "@/components/client-request-console";
import { ClientTeamPortalSection } from "@/components/client-team-portal-section";
import { ClientTripsPanel } from "@/components/client-trips-panel";
import { ClientContractPortalButton } from "@/components/client-contract-portal-button";
import { ClientPortalReadonlyNotice } from "@/components/client-portal-readonly-notice";
import { ClientMonthDashboard } from "@/components/client-month-dashboard";
import { ClientInvoicesPortalPanel } from "@/components/client-invoices-portal-panel";
import { PrimeLogoMark } from "@/components/prime-logo-mark";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { isClientPortalReadOnly } from "@/lib/client/portal-config";
import { logoutAction } from "@/app/login/actions";

type ClientOption = { id: string; name: string; type?: string };
type Tab = "resumo" | "pedir" | "corridas" | "faturas" | "equipe";

type Props = {
  tenantId: string;
  mode: "cliente" | "admin";
  sessionClientId?: string | null;
  initialClients?: ClientOption[];
  initialClientName?: string;
  initialPortalRequestsEnabled?: boolean | null;
  initialCostCenters?: { id: string; code: string | null; name: string }[];
  canManageTeam?: boolean;
  /** gestor = responsável pela conta; solicitante = funcionário que só pede corrida. */
  clientAccess?: "gestor" | "solicitante";
  userName?: string;
};

function TabIcon({ id, active }: { id: Tab; active: boolean }) {
  const c = active ? "#C9A84C" : "currentColor";
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (id) {
    case "resumo":
      return (
        <svg {...p}>
          <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "pedir":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case "corridas":
      return (
        <svg {...p}>
          <path d="M5 17h14M6 17l1.5-5h9L18 17M8 12l1-3h6l1 3" />
          <circle cx="8" cy="18" r="1.5" />
          <circle cx="16" cy="18" r="1.5" />
        </svg>
      );
    case "faturas":
      return (
        <svg {...p}>
          <path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z" />
          <path d="M10 8h4M10 12h4" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 11a3 3 0 1 0 0-6M21 20c0-2.5-1.5-4-4-4.6" />
        </svg>
      );
  }
}

function firstName(name?: string) {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "";
}

export function ClientAppShell({
  tenantId,
  mode,
  sessionClientId,
  initialClients = [],
  initialClientName = "Cliente",
  initialPortalRequestsEnabled = null,
  initialCostCenters = [],
  canManageTeam = false,
  clientAccess = "gestor",
  userName
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState(initialClients);
  const [clientName, setClientName] = useState(initialClientName);
  const [portalRequestsEnabled, setPortalRequestsEnabled] = useState<boolean | null>(initialPortalRequestsEnabled);
  const [reloadKey, setReloadKey] = useState(0);

  const isSolicitante = mode === "cliente" && clientAccess === "solicitante";
  const tabs: { id: Tab; label: string }[] = isSolicitante
    ? [
        { id: "pedir", label: "Agendar viagem" },
        { id: "corridas", label: "Minhas viagens" }
      ]
    : [
        { id: "resumo", label: "Resumo" },
        { id: "pedir", label: "Agendar viagem" },
        { id: "corridas", label: "Corridas" },
        { id: "faturas", label: "Faturas" },
        { id: "equipe", label: "Equipe" }
      ];

  const tabFromUrl = searchParams.get("aba") as Tab | null;
  const [tab, setTabState] = useState<Tab>(
    tabFromUrl && tabs.some((t) => t.id === tabFromUrl) ? tabFromUrl : isSolicitante ? "pedir" : "resumo"
  );

  const selectedClientId = useMemo(() => {
    if (mode === "cliente") return sessionClientId ?? null;
    const fromUrl = searchParams.get("client_id")?.trim();
    if (fromUrl) return fromUrl;
    return clients[0]?.id ?? null;
  }, [mode, sessionClientId, searchParams, clients]);

  const reloadClients = useCallback(async () => {
    if (mode !== "admin") return;
    const res = await fetch("/api/clients", { credentials: "include" });
    const json = (await res.json()) as { success?: boolean; data?: ClientOption[] };
    if (res.ok && json.success) setClients(json.data ?? []);
  }, [mode]);

  useEffect(() => {
    if (mode === "admin" && initialClients.length === 0) void reloadClients();
  }, [mode, initialClients.length, reloadClients]);

  useEffect(() => {
    if (!selectedClientId) return;
    const hit = clients.find((c) => c.id === selectedClientId);
    if (hit?.name) setClientName(hit.name);
    if (mode !== "admin") return;
    void fetch(`/api/clients/${selectedClientId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        const data = body?.data as { name?: string; portal_requests_enabled?: boolean } | undefined;
        if (data?.name) setClientName(data.name);
        if (typeof data?.portal_requests_enabled === "boolean") setPortalRequestsEnabled(data.portal_requests_enabled);
      })
      .catch(() => undefined);
  }, [selectedClientId, clients, mode]);

  function setTab(next: Tab) {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("aba", next);
    router.replace(`/client?${params.toString()}`, { scroll: false });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onClientChange(nextId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextId) params.set("client_id", nextId);
    else params.delete("client_id");
    setPortalRequestsEnabled(null);
    router.replace(`/client?${params.toString()}`, { scroll: false });
  }

  const readOnly = mode === "admin" ? false : isClientPortalReadOnly({ portalRequestsEnabled });
  const devRole = mode === "admin" ? "admin" : "cliente";
  const nome = firstName(userName);

  const greeting = isSolicitante
    ? {
        title: nome ? `Olá, ${nome}. Agende sua viagem aqui.` : "Agende sua viagem aqui.",
        sub: `Escolha data, horário e trajeto. A cobrança vai direto para a ${clientName} — você não paga nada ao motorista.`
      }
    : {
        title: nome ? `Olá, ${nome}.` : "Olá.",
        sub: `Aqui está o resumo das corridas da ${clientName}.`
      };

  return (
    <div className="min-h-screen bg-prime-bg pb-24 text-prime-text sm:pb-10">
      <OperationalRealtimeBridge tenantId={tenantId} />

      <header className="sticky top-0 z-40 bg-[#111]/95 pt-[env(safe-area-inset-top)] text-[#fff] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <PrimeLogoMark size={56} />
            <div className="min-w-0 leading-tight">
              <p className="line-clamp-2 text-base font-semibold text-prime-gold sm:text-lg">{clientName}</p>
              <p className="truncate text-[11px] uppercase tracking-[0.2em] text-[#fff]/70">Portal Prime Vitória</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === "admin" ? (
              <select
                className="max-w-[11rem] rounded-md border border-white/20 bg-[#1d1d1d] px-2 py-1.5 text-xs text-[#fff]"
                value={selectedClientId ?? ""}
                onChange={(e) => onClientChange(e.target.value)}
                aria-label="Cliente em visualização"
              >
                {clients.length === 0 ? <option value="">Carregando…</option> : null}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
            {mode === "admin" ? (
              <a href="/dashboard" className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10">
                Voltar ao painel
              </a>
            ) : (
              <form action={logoutAction}>
                <button type="submit" className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10">
                  Sair
                </button>
              </form>
            )}
          </div>
        </div>
        <nav className="mx-auto hidden max-w-5xl gap-1 px-4 sm:flex sm:px-6" aria-label="Portal do cliente">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-4 py-2.5 text-sm transition ${
                tab === t.id ? "border-prime-gold font-semibold text-[#fff]" : "border-transparent text-white/60 hover:text-[#fff]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div role="main" className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6">
        {mode === "admin" ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Você está vendo o portal como o gestor da {clientName} vê.
          </p>
        ) : null}
        {readOnly ? <ClientPortalReadonlyNotice readOnly /> : null}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-prime-display text-2xl leading-snug sm:text-3xl">{greeting.title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-prime-muted">{greeting.sub}</p>
          </div>
          {!isSolicitante && selectedClientId ? (
            <ClientContractPortalButton clientId={selectedClientId} devFallbackRole={devRole} />
          ) : null}
        </div>

        {!selectedClientId ? (
          <p className="text-sm text-prime-muted">Selecione um cliente.</p>
        ) : (
          <>
            {tab === "resumo" && !isSolicitante ? (
              <>
                <ClientMonthDashboard clientId={mode === "admin" ? selectedClientId : undefined} devFallbackRole={devRole} reloadKey={reloadKey} />
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => setTab("pedir")}
                    className="w-full rounded-xl bg-[#111] px-4 py-3.5 text-base font-semibold text-[#fff] hover:bg-black sm:w-auto"
                  >
                    + Agende sua viagem
                  </button>
                ) : null}
                <ClientTripsPanel
                  key={`up-${selectedClientId}`}
                  tenantId={tenantId}
                  readOnly={readOnly}
                  clientIdOverride={mode === "admin" ? selectedClientId : undefined}
                  devFallbackRole={devRole}
                  showAmounts
                  compact
                  title="Próximas corridas"
                  reloadKey={reloadKey}
                />
              </>
            ) : null}

            {tab === "pedir" ? (
              readOnly ? (
                <p className="text-sm text-prime-muted">Pedidos pelo portal estão desativados para esta conta.</p>
              ) : (
                <>
                  <ClientRequestConsole
                    clientId={selectedClientId}
                    clientName={clientName}
                    costCenters={initialCostCenters}
                    devFallbackRole={devRole}
                    defaultPassengerName={isSolicitante ? userName : ""}
                    onCreated={() => setReloadKey((k) => k + 1)}
                  />
                  {isSolicitante ? (
                    <ClientTripsPanel
                      tenantId={tenantId}
                      devFallbackRole={devRole}
                      compact
                      title="Suas próximas viagens"
                      reloadKey={reloadKey}
                    />
                  ) : null}
                </>
              )
            ) : null}

            {tab === "corridas" ? (
              <ClientTripsPanel
                key={`all-${selectedClientId}`}
                tenantId={tenantId}
                readOnly={readOnly}
                clientIdOverride={mode === "admin" ? selectedClientId : undefined}
                devFallbackRole={devRole}
                showAmounts={!isSolicitante}
                title={isSolicitante ? "Minhas viagens" : "Corridas da empresa"}
                reloadKey={reloadKey}
              />
            ) : null}

            {tab === "faturas" && !isSolicitante ? <ClientInvoicesPortalPanel devFallbackRole={devRole} /> : null}

            {tab === "equipe" && !isSolicitante ? (
              <ClientTeamPortalSection
                clientId={selectedClientId}
                canManage={mode === "admin" ? true : canManageTeam}
                devFallbackRole={devRole}
              />
            ) : null}
          </>
        )}
      </div>

      {/* Navegação de baixo no celular */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-prime-border bg-white sm:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Portal do cliente"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center gap-0.5 pb-2 pt-1.5 text-[11px] ${tab === t.id ? "font-semibold text-prime-text" : "text-prime-muted"}`}
          >
            <span className={`mb-0.5 block h-1 w-6 rounded-full ${tab === t.id ? "bg-prime-gold" : "bg-transparent"}`} />
            <TabIcon id={t.id} active={tab === t.id} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
