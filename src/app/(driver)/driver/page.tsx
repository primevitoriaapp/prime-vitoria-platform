import { Suspense } from "react";
import { DriverAppShell } from "@/components/driver-app-shell";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { fetchInternalApi } from "@/lib/server/internal-fetch";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { getSessionContext } from "@/lib/server/session";
import Link from "next/link";
import { papelUsuarioPt } from "@/lib/i18n/pt-br";

async function loadDriversForAdmin() {
  const response = await fetchInternalApi("/api/drivers");
  if (!response.ok) return [];
  const payload = await response.json();
  return (payload.data ?? []) as Array<{ id: string; cpf: string; profile_name?: string | null }>;
}

export default async function DriverPage() {
  const session = await withResolvedDriverId(await getSessionContext());
  const isMotorista = session.role === "motorista";
  const isAdminPreview = session.role === "admin";
  const isGuest = session.role === "guest" || session.userId === "anonymous";
  const tenantId =
    session.role === "guest" || session.userId === "anonymous" ? null : (session.tenantId ?? DEFAULT_TENANT_ID);

  if (!isMotorista && !isAdminPreview) {
    return (
      <div className="min-h-screen bg-prime-bg text-slate-100">
        <main className="mx-auto max-w-lg px-5 py-16">
          <p className="text-xs uppercase tracking-widest text-amber-500/90">Prime Vitória</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">App motorista</h1>
          {isGuest ? (
            <p className="mt-4 text-sm text-slate-400">
              Entre com conta motorista ou admin para testar o fluxo completo.
            </p>
          ) : (
            <p className="mt-4 text-sm text-amber-200/90">
              Sessão actual: <strong>{papelUsuarioPt(session.role)}</strong>. Esta área exige conta{" "}
              <strong>motorista</strong> ou <strong>admin</strong> (preview).
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login?next=/driver"
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400"
            >
              {isGuest ? "Entrar" : "Trocar conta"}
            </Link>
            {!isGuest ? (
              <Link href="/dashboard" className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200">
                Ir para painel
              </Link>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  const initialDrivers = isAdminPreview ? await loadDriversForAdmin() : [];

  return (
    <Suspense fallback={<div className="min-h-screen bg-prime-bg" />}>
      <DriverAppShell
        tenantId={tenantId}
        mode={isAdminPreview ? "admin" : "motorista"}
        sessionDriverId={session.driverId ?? null}
        initialDrivers={initialDrivers}
      />
    </Suspense>
  );
}
