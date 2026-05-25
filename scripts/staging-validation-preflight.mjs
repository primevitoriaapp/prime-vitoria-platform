#!/usr/bin/env node
/**
 * Pré-voo antes do smoke humano completo em staging/preview.
 *
 * Automatizado: health, flags FCM no servidor, pricing Comexport (com --automated).
 * Humano obrigatório: OPERATIONAL_HUMAN_SMOKE + FCM_OPERATIONAL_SMOKE no browser.
 *
 * Env: BASE_URL, STAGING_E2E_PASSWORD (ou STAGING_SEED_PASSWORD)
 *       VERCEL_AUTOMATION_BYPASS_SECRET (preview protegido)
 *       Para --automated: Supabase keys como e2e-pricing-preview
 */
import { spawnSync } from "node:child_process";
import { applyBaseUrlFallback, loadEnvFiles } from "../src/lib/deploy/env-files.mjs";
import { smokeRequestHeaders, isVercelProtectionResponse } from "../src/lib/deploy/smoke-http.mjs";

loadEnvFiles();
applyBaseUrlFallback();

const base = (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const automated = process.argv.includes("--automated");
const password = process.env.STAGING_E2E_PASSWORD?.trim() || process.env.STAGING_SEED_PASSWORD?.trim();

const blockers = [];
const warnings = [];

function run(label, cmd, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? "signal"})`);
  }
}

async function probeHealth() {
  const url = `${base}/api/health?detailed=1`;
  const res = await fetch(url, { headers: smokeRequestHeaders() });
  const text = await res.text();
  if (isVercelProtectionResponse({ responseUrl: res.url, body: text })) {
    blockers.push("Deployment Protection — configure VERCEL_AUTOMATION_BYPASS_SECRET");
    return null;
  }
  if (!res.ok) {
    blockers.push(`Health ${res.status} em ${url}`);
    return null;
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    blockers.push("Health response não é JSON");
    return null;
  }
  const c = json.checks ?? {};
  console.log("Health checks:", JSON.stringify(c, null, 2));
  if (!c.supabase_public) warnings.push("supabase_public=false no health");
  if (!c.fcm) warnings.push("FCM_SERVER_KEY ausente — push falhará até configurar Vercel");
  if (!c.fcm_web) warnings.push("Firebase Web env ausente — auto-registo push indisponível");
  if (!c.fcm_operational_ready) warnings.push("fcm_operational_ready=false — smoke FCM F1–F8 pode ser FAIL");
  return json;
}

function printHumanPlan() {
  console.log(`
══════════════════════════════════════════════════════════════
  PRÓXIMO: SMOKE HUMANO (obrigatório — browser)
══════════════════════════════════════════════════════════════

  1. Registar execução em:
     docs/STAGING_VALIDATION_EXECUTION_LOG.md

  2. Roteiro operacional (~25–40 min):
     docs/OPERATIONAL_HUMAN_SMOKE.md
     → operador → motorista → cliente → timeline → finalização

  3. Roteiro FCM (~15–25 min, após secrets Firebase):
     docs/FCM_OPERATIONAL_SMOKE.md

  4. Critério MVP operacional pronto:
     G1–G5 PASS + F1–F9 PASS (ou F9 fallback documentado)
     Sem workaround crítico (UUID console, API manual)

  Runbook completo: docs/STAGING_VALIDATION_RUNBOOK.md
  Folha 1 página:   npm run staging:smoke-quickstart

  Corrida seed (ciclo completo): c2000000-0000-4000-8000-000000000001 (requested)
`);
}

async function main() {
  if (!base) blockers.push("BASE_URL ou NEXT_PUBLIC_BASE_URL");
  if (!password) blockers.push("STAGING_E2E_PASSWORD ou STAGING_SEED_PASSWORD");

  console.log(`staging-validation-preflight → ${base || "(sem URL)"}`);

  if (blockers.length === 0) {
    await probeHealth();
  }

  if (warnings.length) {
    console.log("\nAvisos:");
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }

  if (blockers.length) {
    console.error("\nBlockers (corrigir antes do smoke humano):");
    for (const b of blockers) console.error(`  ✗ ${b}`);
    process.exit(1);
  }

  if (automated) {
    const needSupabase = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY"
    ].filter((k) => !process.env[k]?.trim());
    if (needSupabase.length) {
      console.error(`--automated requer: ${needSupabase.join(", ")}`);
      process.exit(1);
    }
    run("unit tests", "npm", ["test"]);
    run("pricing Comexport preview", "node", ["scripts/e2e-pricing-preview.mjs"]);
    run("staging API all roles", "node", ["scripts/e2e-staging-all-roles.mjs"]);
    console.log("\n✓ Camada automatizada PASS");
  } else {
    console.log("\nDica: npm run staging:validation-automated  (testes + pricing + APIs)");
  }

  printHumanPlan();
  console.log("Preflight OK — pode iniciar smoke humano.\n");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
