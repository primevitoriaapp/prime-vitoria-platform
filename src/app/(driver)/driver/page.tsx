import Link from "next/link";
import { DriverConsole } from "@/components/driver-console";
import { DriverPushRegister } from "@/components/driver-push-register";
import { DriverOffersPanel } from "@/components/driver-offers-panel";
import { DriverOperationalStatusPanel } from "@/components/driver-operational-status-panel";
import { DriverPayablesPanel } from "@/components/driver-payables-panel";
import { DriverTripsPanel } from "@/components/driver-trips-panel";
import { OperationalRealtimeBridge } from "@/components/operational-realtime-bridge";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { getSessionContext } from "@/lib/server/session";

export default async function DriverPage() {
  const session = await getSessionContext();
  const isMotorista = session.role === "motorista";
  const tenantId =
    session.role === "guest" || session.userId === "anonymous" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);

  if (!isMotorista) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto max-w-lg px-5 py-16">
          <p className="text-xs uppercase tracking-widest text-amber-500/90">Prime Vitória</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">App motorista</h1>
          <p className="mt-4 text-sm text-slate-400">
            Área para motoristas com corridas atribuídas. Instale no telemóvel após entrar com a conta de motorista.
          </p>
          <Link
            href="/login?next=/driver"
            className="mt-8 inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400"
          >
            Entrar
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <OperationalRealtimeBridge tenantId={tenantId} />
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-500/90">Prime Vitória</p>
            <h1 className="text-lg font-semibold text-white">Motorista</h1>
          </div>
          <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">PWA</span>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-6 px-4 py-6 pb-24">
        <p className="text-sm text-slate-400">
          Aceite a corrida, actualize o estado e use Maps/Waze. Ao concluir, o KM é recalculado automaticamente.
        </p>

        <DriverOperationalStatusPanel />
        <DriverOffersPanel />
        <DriverTripsPanel tenantId={tenantId} />

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pagamentos</h2>
          <div className="mt-3 [&_.card]:border-slate-700 [&_.card]:bg-slate-900 [&_input]:border-slate-600 [&_input]:bg-slate-800 [&_input]:text-slate-100">
            <DriverPayablesPanel tenantId={tenantId} devFallbackRole="motorista" />
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Notificações push</h2>
          <div className="mt-3 [&_.card]:border-0 [&_.card]:bg-transparent [&_.card]:p-0 [&_input]:border-slate-600 [&_input]:bg-slate-800 [&_input]:text-slate-100">
            <DriverPushRegister />
          </div>
        </section>

        <details className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-400">Ferramentas avançadas (staging)</summary>
          <div className="mt-4 [&_.card]:border-slate-700 [&_.card]:bg-slate-900 [&_input]:border-slate-600 [&_input]:bg-slate-800 [&_input]:text-slate-100">
            <DriverConsole />
          </div>
        </details>
      </main>
    </div>
  );
}
