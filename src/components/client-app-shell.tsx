"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ClientRequestConsole } from "@/components/client-request-console";
import { ClientTeamPortalSection } from "@/components/client-team-portal-section";
import { ClientTripsPanel } from "@/components/client-trips-panel";
import { ClientContractPortalButton } from "@/components/client-contract-portal-button";
import { ClientPortalNav } from "@/components/client-portal-nav";
import { ClientPortalReadonlyNotice } from "@/components/client-portal-readonly-notice";
import { BrandLogo } from "@/components/brand-logo";
import { StagingSmokeHints } from "@/components/staging-smoke-hints";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { isClientPortalReadOnly } from "@/lib/client/portal-config";
import { scrollToSolicitar } from "@/lib/client/scroll-to-solicitar";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type ClientOption = { id: string; name: string; type?: string };

type Props = {
  tenantId: string;
  mode: "cliente" | "admin";
  sessionClientId?: string | null;
  initialClients?: ClientOption[];
  initialClientName?: string;
  initialPortalRequestsEnabled?: boolean | null;
  initialCostCenters?: { id: string; code: string | null; name: string }[];
  canManageTeam?: boolean;
};

export function ClientAppShell({
  tenantId,
  mode,
  sessionClientId,
  initialClients = [],
  initialClientName = "Cliente",
  initialPortalRequestsEnabled = null,
  initialCostCenters = [],
  canManageTeam = false
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState(initialClients);
  const [costCenters, setCostCenters] = useState(initialCostCenters);
  const [clientName, setClientName] = useState(initialClientName);
  const [portalRequestsEnabled, setPortalRequestsEnabled] = useState<boolean | null>(
    initialPortalRequestsEnabled
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
    if (typeof window === "undefined") return;
    if (window.location.hash === "#solicitar") {
      window.requestAnimationFrame(() => scrollToSolicitar());
    }
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) return;
    const hit = clients.find((c) => c.id === selectedClientId);
    if (hit?.name) setClientName(hit.name);
    void fetch(`/api/clients/${selectedClientId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        if (!body?.success || !body?.data) return;
        const data = body.data as { name?: string; portal_requests_enabled?: boolean };
        if (data.name) setClientName(data.name);
        if (typeof data.portal_requests_enabled === "boolean") {
          setPortalRequestsEnabled(data.portal_requests_enabled);
        }
      })
      .catch(() => undefined);
  }, [selectedClientId, clients]);

  function onClientChange(nextId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextId) params.set("client_id", nextId);
    else params.delete("client_id");
    setPortalRequestsEnabled(null);
    router.replace(`/client?${params.toString()}`, { scroll: false });
  }

  const readOnly =
    mode === "admin" ? false : isClientPortalReadOnly({ portalRequestsEnabled });
  const saudacao =
    mode === "admin"
      ? `Preview admin — portal da ${clientName}.`
      : readOnly
        ? `Visão consulta — operação executiva da ${clientName}.`
        : `Olá — aqui está a visão da operação executiva da ${clientName}.`;

  return (
    <div className="prime-theme min-h-screen bg-prime-bg text-prime-text">
      <OperationalRealtimeBridge tenantId={tenantId} />
      <header className="border-b border-prime-border bg-white shadow-prime-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <BrandLogo subtitle="PORTAL CORPORATIVO" compact />
          <div className="flex flex-wrap items-center gap-4">
            {mode === "admin" ? (
              <label className="grid gap-1 text-xs text-prime-muted">
                <span>Cliente em preview</span>
                <select
                  className={`min-w-[12rem] ${PRIME_INPUT_CLASS} py-1.5`}
                  value={selectedClientId ?? ""}
                  onChange={(e) => onClientChange(e.target.value)}
                >
                  {clients.length === 0 ? <option value="">— carregando —</option> : null}
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <ClientPortalNav readOnly={readOnly} />
                {selectedClientId ? (
                  <ClientContractPortalButton
                    clientId={selectedClientId}
                    devFallbackRole="cliente"
                  />
                ) : null}
              </>
            )}
            {mode === "admin" && selectedClientId ? (
              <ClientContractPortalButton clientId={selectedClientId} devFallbackRole="admin" />
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-5 py-8">
        {mode === "admin" && !selectedClientId ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Selecione um cliente cadastrado para testar solicitações e acompanhamento de corridas.
          </p>
        ) : null}

        <StagingSmokeHints variant="light" />
        {readOnly ? <ClientPortalReadonlyNotice readOnly /> : null}

        <section id="visao" className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <p className="font-serif text-2xl leading-snug text-prime-text md:text-3xl">{saudacao}</p>
            <p className="mt-3 text-sm text-prime-muted">
              {mode === "admin"
                ? "Visualize e teste o portal como o cliente corporativo — solicitações, corridas e detalhes."
                : readOnly
                  ? "Consulte corridas, estados, centros de custo e passageiros."
                  : "Solicite corridas, acompanhe status e centros de custo."}
            </p>
          </div>
          {!readOnly && selectedClientId ? (
            <button
              type="button"
              className="btn-primary inline-flex shrink-0 items-center justify-center px-5 py-2.5 text-sm"
              onClick={scrollToSolicitar}
            >
              + Nova solicitação
            </button>
          ) : null}
        </section>

        {selectedClientId ? (
          <>
            {!readOnly ? (
              <section id="solicitar" className="scroll-mt-6 space-y-3">
                <h2 className="font-serif text-xl text-prime-text">Nova solicitação</h2>
                <ClientRequestConsole
                  clientId={selectedClientId}
                  costCenters={costCenters}
                  devFallbackRole={mode === "admin" ? "admin" : "cliente"}
                />
              </section>
            ) : null}

            <ClientTeamPortalSection
              clientId={selectedClientId}
              canManage={mode === "admin" ? true : canManageTeam}
              devFallbackRole={mode === "admin" ? "admin" : "cliente"}
            />

            <ClientTripsPanel
              key={selectedClientId}
              tenantId={tenantId}
              readOnly={readOnly}
              clientIdOverride={mode === "admin" ? selectedClientId : undefined}
              devFallbackRole={mode === "admin" ? "admin" : "cliente"}
            />
          </>
        ) : null}
      </main>
    </div>
  );
}
