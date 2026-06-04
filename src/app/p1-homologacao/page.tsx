import Link from "next/link";
import {
  PRODUCTION_APP_URL,
  STAGING_OFFICIAL_BRANCH,
  STAGING_OFFICIAL_PREVIEW_URL
} from "@/lib/staging/official-preview";

const P1_COMMIT = "3cd8522";
const VERCEL_DEPLOYMENT =
  "https://vercel.com/rubens-projects2/prime-vitoria-web/b4zBDpLScquyL6hLqyAs4NxDL3cP";

export default function P1HomologacaoPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10 font-sans text-slate-900">
      <h1 className="text-2xl font-bold">Homologação P1 — URL oficial</h1>
      <p className="mt-2 text-slate-600">Abra só este ambiente para testar cadastro e despacho.</p>

      <div className="mt-6 rounded-lg border-2 border-emerald-500 bg-emerald-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">URL P1</p>
        <a
          href={STAGING_OFFICIAL_PREVIEW_URL}
          className="mt-2 block break-all text-sm font-medium text-emerald-900 underline"
        >
          {STAGING_OFFICIAL_PREVIEW_URL}
        </a>
        <p className="mt-3 text-xs text-emerald-900">
          Branch <code>{STAGING_OFFICIAL_BRANCH}</code> · commit <code>{P1_COMMIT}</code>
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-xs font-semibold uppercase text-red-800">Não usar (produção antiga)</p>
        <p className="mt-1 break-all font-mono text-xs text-red-900">{PRODUCTION_APP_URL}</p>
      </div>

      <section className="mt-6 rounded border p-4 text-sm">
        <h2 className="font-semibold">Amanhã — ordem dos passos</h2>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs">
          <li>Rubens: desactivar Vercel Authentication no preview</li>
          <li>Secrets GitHub + Vercel Preview (docs/P1_SECRETS_CHECKLIST.md)</li>
          <li>Workflows: migration 0044 → seed (reset_password=true)</li>
          <li>Abrir esta URL → /staging-status → tudo verde</li>
          <li>Login operador → 4 testes (Segpro, Felipe, BYD King, despacho)</li>
        </ol>
      </section>

      <ul className="mt-6 list-inside list-disc space-y-2 text-sm">
        <li>
          Menu P1: <strong>Clientes · Motoristas · Veículos · Despacho</strong>
        </li>
        <li>
          Operador (homologação): <code>staging-operador@example.com</code>
        </li>
        <li>
          Admin: <code>staging-admin@example.com</code> · Financeiro:{" "}
          <code>staging-financeiro@example.com</code>
        </li>
        <li>
          Motorista: <code>staging-motorista@example.com</code> · Cliente:{" "}
          <code>staging-cliente@example.com</code>
        </li>
        <li>
          <Link href="/staging-status" className="text-violet-700 underline">
            Ver status do ambiente
          </Link>
        </li>
        <li>
          <a href={VERCEL_DEPLOYMENT} className="text-violet-700 underline" target="_blank" rel="noreferrer">
            Abrir deployment no Vercel
          </a>
        </li>
      </ul>

      <p className="mt-8 text-xs text-slate-500">
        Guia completo: <code>docs/AMANHA_P1.md</code>
      </p>
    </main>
  );
}
