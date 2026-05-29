import Link from "next/link";
import { KpiCard } from "@/components/kpi-card";
import { LiveMap } from "@/components/live-map";
import { OperationsReportExport } from "@/components/operations-report-export";
import { InAppNotificationsPanel } from "@/components/in-app-notifications-panel";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import type { SessionContext } from "@/lib/domain/types";
import { can } from "@/lib/security/rbac";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { fetchInternalApi } from "@/lib/server/internal-fetch";
import { getSessionContext } from "@/lib/server/session";

async function getData() {
  const response = await fetchInternalApi("/api/reports/operations");
  if (!response.ok) return { totalTrips: 0, completedTrips: 0, activeDrivers: 0 };
  const payload = await response.json();
  return payload.data;
}

type AuditRow = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

async function getRecentAudit(session: SessionContext): Promise<AuditRow[]> {
  if (!can(session, "trip.read")) return [];
  const response = await fetchInternalApi("/api/audit-events?pageSize=8");
  if (!response.ok) return [];
  const payload = await response.json();
  return (payload.data?.items ?? []) as AuditRow[];
}

export default async function DashboardPage() {
  const session = await getSessionContext();
  const realtimeTenantId =
    session.role === "guest" || session.userId === "anonymous" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);

  const data = await getData();
  const auditItems = await getRecentAudit(session);

  return (
    <main>
      <OperationalRealtimeBridge tenantId={realtimeTenantId} />
      <h1>Painel operacional</h1>
      {(session.role === "admin" || session.role === "operador" || session.role === "financeiro") && (
        <p className="mb-4 text-sm text-slate-600">
          <Link href="/agenda" className="font-medium text-amber-700 hover:underline">
            Agenda
          </Link>
          {" · "}
          <Link href="/clients" className="font-medium text-amber-700 hover:underline">
            Clientes
          </Link>
          {" · "}
          <Link href="/drivers" className="font-medium text-amber-700 hover:underline">
            Motoristas
          </Link>
          {" · "}
          <Link href="/vehicles" className="font-medium text-amber-700 hover:underline">
            Veículos
          </Link>
          {can(session, "profiles.read") ? (
            <>
              {" · "}
              <Link href="/users" className="font-medium text-amber-700 hover:underline">
                Utilizadores
              </Link>
            </>
          ) : null}
          {" · "}
          <Link href="/dispatch" className="font-medium text-amber-700 hover:underline">
            Despacho
          </Link>
        </p>
      )}
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <KpiCard label="Corridas" value={data.totalTrips} />
        <KpiCard label="Finalizadas" value={data.completedTrips} />
        <KpiCard label="Motoristas ativos" value={data.activeDrivers} />
      </div>
      {session.role === "admin" || session.role === "financeiro" ? (
        <InAppNotificationsPanel
          tenantId={realtimeTenantId}
          devFallbackRole={session.role === "financeiro" ? "financeiro" : "admin"}
          compact
        />
      ) : null}
      {auditItems.length > 0 ? (
        <section className="card mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Auditoria recente</h2>
            <Link href="/audit" className="text-sm font-medium text-amber-700 hover:underline">
              Ver tudo
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-slate-200 text-sm">
            {auditItems.map((row) => (
              <li key={row.id} className="flex flex-wrap gap-2 py-2 text-slate-700">
                <span className="font-mono text-xs text-slate-500">
                  {new Date(row.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}
                </span>
                <span className="font-medium text-amber-700">{row.action}</span>
                <span>
                  {row.entity_type}
                  {row.entity_id ? ` · ${row.entity_id.slice(0, 8)}…` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {can(session, "report.read") ? (
        <OperationsReportExport
          devFallbackRole={session.role === "financeiro" ? "financeiro" : session.role === "operador" ? "operador" : "admin"}
        />
      ) : null}
      <h2 className="mt-8">Monitoramento em tempo real</h2>
      <LiveMap tenantId={realtimeTenantId} />
    </main>
  );
}
