import { Suspense } from "react";
import Link from "next/link";
import { ClientAppShell } from "@/components/client-app-shell";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { db } from "@/lib/server/db";
import { fetchInternalApi } from "@/lib/server/internal-fetch";
import { canManageClientTeam } from "@/lib/clients/client-portal-team-access";
import { getSessionContext } from "@/lib/server/session";

async function loadClientsForAdmin() {
  const response = await fetchInternalApi("/api/clients");
  if (!response.ok) return [];
  const payload = await response.json();
  return (payload.data ?? []) as Array<{ id: string; name: string; type?: string }>;
}

export default async function ClientPage() {
  const session = await getSessionContext();
  const isCliente = session.role === "cliente" && Boolean(session.clientId);
  const isAdminPreview = session.role === "admin";

  if (!isCliente && !isAdminPreview) {
    return (
      <div className="min-h-screen bg-prime-bg text-slate-100">
        <main className="mx-auto max-w-lg px-5 py-16">
          <p className="text-xs uppercase tracking-widest text-amber-500/90">Prime Vitória</p>
          <h1 className="mt-2 font-serif text-2xl text-white">Portal corporativo</h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Esta área é para contas de cliente corporativo ou admin em modo preview.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login?next=/client"
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400"
            >
              Entrar
            </Link>
            <Link href="/dashboard" className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900">
              Painel admin
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
  const clientId = isCliente ? session.clientId! : null;

  let nomeCliente = "Cliente";
  let initialPortalRequestsEnabled: boolean | null = null;
  let costCenters: { id: string; code: string | null; name: string }[] = [];
  if (isCliente && clientId) {
    try {
      const [{ data: clientRow }, { data: cc }] = await Promise.all([
        db
          .from("clients")
          .select("name, portal_requests_enabled")
          .eq("id", clientId)
          .eq("tenant_id", tenantId)
          .maybeSingle(),
        db.from("cost_centers").select("id, code, name").eq("client_id", clientId).order("name").limit(30)
      ]);
      nomeCliente = clientRow?.name ?? nomeCliente;
      if (typeof clientRow?.portal_requests_enabled === "boolean") {
        initialPortalRequestsEnabled = clientRow.portal_requests_enabled;
      }
      costCenters = cc ?? [];
    } catch {
      /* fallback via API nos painéis */
    }
  }

  const initialClients = isAdminPreview ? await loadClientsForAdmin() : [];

  const canManageTeam =
    isAdminPreview || (isCliente && clientId ? await canManageClientTeam(session, clientId) : false);

  return (
    <Suspense fallback={<div className="min-h-screen bg-prime-bg" />}>
      <ClientAppShell
        tenantId={tenantId}
        mode={isAdminPreview ? "admin" : "cliente"}
        sessionClientId={clientId}
        initialClients={initialClients}
        initialClientName={nomeCliente}
        initialPortalRequestsEnabled={initialPortalRequestsEnabled}
        initialCostCenters={costCenters}
        canManageTeam={canManageTeam}
      />
    </Suspense>
  );
}
