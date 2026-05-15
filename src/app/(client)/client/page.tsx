import Link from "next/link";
import { ClientRequestConsole } from "@/components/client-request-console";
import { ClientTripsPanel } from "@/components/client-trips-panel";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { db } from "@/lib/server/db";
import { getSessionContext } from "@/lib/server/session";

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

  let nomeCliente = "Cliente";
  let costCenters: { id: string; code: string | null; name: string }[] = [];
  try {
    const [{ data: clientRow }, { data: cc }] = await Promise.all([
      db.from("clients").select("name").eq("id", clientId).eq("tenant_id", tenantId).maybeSingle(),
      db.from("cost_centers").select("id, code, name").eq("client_id", clientId).order("name").limit(30)
    ]);
    nomeCliente = clientRow?.name ?? nomeCliente;
    costCenters = cc ?? [];
  } catch {
    /* Supabase indisponível (ex.: CI com placeholders) — painel de viagens carrega via API cliente */
  }

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

        <ClientTripsPanel tenantId={tenantId} costCenters={costCenters ?? []} />

        <section id="solicitar" className="space-y-3">
          <h2 className="font-serif text-xl text-white">Nova solicitação</h2>
          <div className="[&_.card]:border-slate-700 [&_.card]:bg-slate-900 [&_input]:border-slate-600 [&_input]:bg-slate-800 [&_input]:text-slate-100 [&_input]:placeholder:text-slate-500">
            <ClientRequestConsole clientId={clientId} costCenters={costCenters ?? []} />
          </div>
        </section>
      </main>
    </div>
  );
}
