import Link from "next/link";
import {
  PRODUCTION_APP_URL,
  STAGING_OFFICIAL_PREVIEW_URL
} from "@/lib/staging/official-preview";

type Status = Awaited<
  ReturnType<typeof import("@/lib/server/staging-status").buildStagingStatusPayload>
>;

async function loadStatus(): Promise<Status | null> {
  try {
    const { buildStagingStatusPayload } = await import("@/lib/server/staging-status");
    return await buildStagingStatusPayload();
  } catch {
    return null;
  }
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? "inline-block rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900"
          : "inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950"
      }
    >
      {label}
    </span>
  );
}

export default async function StagingStatusPage() {
  const status = await loadStatus();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 font-sans text-sm text-slate-900">
      <h1 className="text-xl font-bold">Status homologação P1</h1>
      <p className="mt-2 text-slate-600">
        Página de diagnóstico — sem passwords. Use para confirmar ambiente antes de homologar.
      </p>

      <section className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <h2 className="font-semibold text-emerald-950">URL certa para homologar P1</h2>
        <p className="mt-2 break-all font-mono text-xs">{STAGING_OFFICIAL_PREVIEW_URL}</p>
        <p className="mt-3 text-xs text-emerald-900">
          Não use produção:{" "}
          <span className="font-mono">{PRODUCTION_APP_URL}</span>
        </p>
      </section>

      {!status ? (
        <p className="mt-6 text-red-700">Não foi possível carregar o status.</p>
      ) : (
        <>
          <section className="mt-6 space-y-2">
            <p>
              Ambiente P1: <Badge ok={status.is_p1_environment} label={status.is_p1_environment ? "sim" : "não"} />
            </p>
            <p>
              Pronto para homologar: <Badge ok={status.ok} label={status.ok ? "sim" : "não"} />
            </p>
            <p className="text-xs text-slate-500">Atualizado: {status.time}</p>
          </section>

          <section className="mt-6 rounded border p-4">
            <h2 className="font-semibold">Deployment</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
              <li>Vercel env: {status.deployment.vercel_env ?? "—"}</li>
              <li>Host: {status.deployment.vercel_url_host ?? "—"}</li>
              <li>Branch: {status.deployment.git_commit_ref ?? "—"}</li>
              <li>Commit: {status.deployment.git_commit_sha?.slice(0, 7) ?? "—"}</li>
            </ul>
          </section>

          <section className="mt-4 rounded border p-4">
            <h2 className="font-semibold">Configuração</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
              <li>Supabase público: {status.config.supabase_public_configured ? "sim" : "não"}</li>
              <li>Supabase service: {status.config.supabase_service_configured ? "sim" : "não"}</li>
              <li>BASE_URL host: {status.config.base_url_host ?? "—"}</li>
              <li>BASE_URL = deployment: {String(status.config.base_url_matches_vercel)}</li>
              <li>Atalhos login staging: {status.config.smoke_hints_enabled ? "sim" : "não"}</li>
            </ul>
          </section>

          <section className="mt-4 rounded border p-4">
            <h2 className="font-semibold">Migration 0044</h2>
            <p className="mt-2 text-xs">
              {status.migration_0044.checked
                ? status.migration_0044.ready
                  ? "PASS — colunas P1 presentes"
                  : `FAIL — ${status.migration_0044.detail}`
                : "Não verificado (sem service role)"}
            </p>
          </section>

          <section className="mt-4 rounded border p-4">
            <h2 className="font-semibold">Migration 0045 (foto motorista)</h2>
            <p className="mt-2 text-xs">
              {status.migration_0045.checked
                ? status.migration_0045.ready
                  ? "PASS — coluna photo_url presente"
                  : `FAIL — ${status.migration_0045.detail}`
                : "Não verificado (sem service role)"}
            </p>
          </section>

          <section className="mt-4 rounded border p-4">
            <h2 className="font-semibold">Seed staging</h2>
            <p className="mt-2 text-xs">
              {status.staging_seed.checked
                ? `${status.staging_seed.users_found}/${status.staging_seed.users_expected} — ${status.staging_seed.detail}`
                : "Não verificado"}
            </p>
          </section>

          {status.blockers.length > 0 && (
            <section className="mt-4 rounded border border-red-300 bg-red-50 p-4">
              <h2 className="font-semibold text-red-950">Bloqueios</h2>
              <ul className="mt-2 list-inside list-disc text-xs text-red-950">
                {status.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          )}

          {status.next_steps.length > 0 && (
            <section className="mt-4 rounded border border-violet-200 bg-violet-50 p-4">
              <h2 className="font-semibold text-violet-950">Próximos passos</h2>
              <ol className="mt-2 list-inside list-decimal text-xs text-violet-950">
                {status.next_steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>
          )}

          {status.warnings.length > 0 && (
            <section className="mt-4 rounded border border-amber-300 bg-amber-50 p-4">
              <h2 className="font-semibold text-amber-950">Avisos</h2>
              <ul className="mt-2 list-inside list-disc text-xs text-amber-950">
                {status.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="mt-6">
        <Link href="/p1-homologacao" className="text-sm font-medium text-violet-700 underline">
          Guia URL P1
        </Link>
      </p>

      <p className="mt-4 text-xs text-slate-500">
        JSON: <Link href="/api/staging-status" className="underline">/api/staging-status</Link>
        {" · "}
        Docs: <code>docs/AMANHA_P1.md</code>
      </p>
    </main>
  );
}
