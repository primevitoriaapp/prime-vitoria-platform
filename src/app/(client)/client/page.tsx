import Link from "next/link";
import { ClientRequestConsole } from "@/components/client-request-console";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { TripTrackingLinkButton } from "@/components/trip-tracking-link-button";
import { StatusBadge } from "@/components/status-badge";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { db } from "@/lib/server/db";
import { fetchInternalApi } from "@/lib/server/internal-fetch";
import { getSessionContext } from "@/lib/server/session";

const EM_ANDAMENTO: TripOperationalStatus[] = [
  "dispatched",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress"
];

function inicioMesUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export default async function ClientPage() {
  const session = await getSessionContext();
  const isCliente = session.role === "cliente" && Boolean(session.clientId);

  if (!isCliente) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto max-w-lg px-5 py-16">
          <p className="text-xs uppercase tracking-widest text-amber-500/90">Prime Vitória</p>
          <h1 className="mt-2 font-serif text-2xl text-white">Portal corporativo</h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Esta área é para contas de cliente corporativo. Entre com a sua organização ou use o painel
            operacional.
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

  const clientId = session.clientId!;
  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;

  const [{ data: clientRow }, tripsRes, { data: costCenters }] = await Promise.all([
    db.from("clients").select("name").eq("id", clientId).eq("tenant_id", tenantId).maybeSingle(),
    fetchInternalApi("/api/trips?page=1&pageSize=50"),
    db.from("cost_centers").select("id, code, name").eq("client_id", clientId).order("name").limit(30)
  ]);

  const tripsJson = tripsRes.ok ? ((await tripsRes.json()) as { success?: boolean; data?: { items: Trip[]; total: number } }) : null;
  const items = tripsJson?.success ? (tripsJson.data?.items ?? []) : [];
  const totalLista = tripsJson?.success ? (tripsJson.data?.total ?? items.length) : 0;

  const agora = new Date();
  const mesIni = inicioMesUtc(agora);
  const corridasMes = items.filter((t) => new Date(t.scheduled_at) >= mesIni).length;
  const emAndamento = items.filter((t) => EM_ANDAMENTO.includes(t.operational_status)).length;

  const porCentro = new Map<string, number>();
  for (const t of items) {
    if (t.cost_center_id) {
      porCentro.set(t.cost_center_id, (porCentro.get(t.cost_center_id) ?? 0) + 1);
    }
  }

  const nomeCliente = clientRow?.name ?? "Cliente";
  const saudacao = `Olá — aqui está a visão da operação executiva da ${nomeCliente}.`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <OperationalRealtimeBridge tenantId={tenantId} />
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-500/90">Prime Vitória</p>
            <h1 className="text-lg font-semibold text-white">Portal corporativo</h1>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm text-slate-400">
            <a href="#visao" className="hover:text-amber-400">
              Início
            </a>
            <a href="#solicitar" className="hover:text-amber-400">
              Solicitações
            </a>
            <a href="#corridas" className="hover:text-amber-400">
              Corridas
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-5 py-8">
        <section id="visao" className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <p className="font-serif text-2xl leading-snug text-white md:text-3xl">{saudacao}</p>
            <p className="mt-3 text-sm text-slate-400">
              Solicite corridas, acompanhe status e centros de custo. Valores detalhados de faturamento
              ficarão no módulo financeiro quando estiver disponível para o portal.
            </p>
          </div>
          <Link
            href="#solicitar"
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-slate-950 hover:bg-amber-400"
          >
            + Nova solicitação
          </Link>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Corridas (mês)</p>
            <p className="mt-1 font-serif text-3xl text-amber-400">{corridasMes}</p>
            <p className="mt-1 text-xs text-slate-500">Na página atual (até {items.length} itens)</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Em andamento</p>
            <p className="mt-1 font-serif text-3xl text-amber-400">{emAndamento}</p>
            <p className="mt-1 text-xs text-slate-500">Despachada até em progresso</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total listado</p>
            <p className="mt-1 font-serif text-3xl text-amber-400">{totalLista}</p>
            <p className="mt-1 text-xs text-slate-500">Resultado da API (paginação)</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Centros de custo</p>
            <p className="mt-1 font-serif text-3xl text-amber-400">{costCenters?.length ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">Cadastrados para o cliente</p>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          <section id="corridas" className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-serif text-xl text-white">Minhas corridas</h2>
              <span className="text-xs text-slate-500">Ordenadas por data agendada</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-800">
              {items.length === 0 ? (
                <p className="p-6 text-sm text-slate-400">Nenhuma corrida encontrada. Faça a primeira solicitação abaixo.</p>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {items.map((trip) => (
                    <li key={trip.id} className="flex flex-col gap-2 p-4 hover:bg-slate-900/40 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-amber-500/90">{trip.id.slice(0, 8)}…</span>
                          <StatusBadge status={trip.operational_status} />
                        </div>
                        <p className="text-sm font-medium text-white">
                          {trip.passenger_name?.trim() || "Passageiro a definir"}
                          {trip.service_type ? (
                            <span className="font-normal text-slate-500"> · {trip.service_type}</span>
                          ) : null}
                        </p>
                        <p className="text-sm text-slate-400">
                          {trip.origin_text} → {trip.destination_text}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(trip.scheduled_at).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short"
                          })}
                        </p>
                      </div>
                      <div className="shrink-0 pt-1 sm:pt-0">
                        <TripTrackingLinkButton tripId={trip.id} variant="dark" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <h2 className="font-serif text-lg text-white">Centros de custo</h2>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              {(costCenters ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum centro de custo cadastrado.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {(costCenters ?? []).map((cc) => (
                    <li key={cc.id} className="flex justify-between gap-2 border-b border-slate-800/80 pb-2 last:border-0 last:pb-0">
                      <span className="truncate text-slate-300">{cc.code ? `${cc.code} · ` : ""}{cc.name}</span>
                      <span className="shrink-0 text-amber-500/90">{porCentro.get(cc.id) ?? 0}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-slate-600">
              Gere um link de rastreio partilhável na lista de corridas. Os totais por centro refletem apenas as
              corridas visíveis nesta página.
            </p>
          </aside>
        </div>

        <section id="solicitar" className="space-y-3">
          <h2 className="font-serif text-xl text-white">Nova solicitação</h2>
          <div className="[&_.card]:border-slate-700 [&_.card]:bg-slate-900 [&_input]:border-slate-600 [&_input]:bg-slate-800 [&_input]:text-slate-100 [&_input]:placeholder:text-slate-500">
            <ClientRequestConsole />
          </div>
        </section>
      </main>
    </div>
  );
}
