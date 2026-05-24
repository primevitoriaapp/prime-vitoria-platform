#!/usr/bin/env node
/**
 * Orquestra smoke obrigatório do night cycle (preview ou local).
 * Carrega .env.supabase.local, .env.vercel.local, .env.local, .env
 *
 * Env: BASE_URL, STAGING_E2E_PASSWORD, VERCEL_AUTOMATION_BYPASS_SECRET (opcional)
 */
import { spawnSync } from "node:child_process";
import { applyBaseUrlFallback, loadEnvFiles } from "../src/lib/deploy/env-files.mjs";
import { smokeRequestHeaders, isVercelProtectionResponse } from "../src/lib/deploy/smoke-http.mjs";

loadEnvFiles();
applyBaseUrlFallback();

const base = (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv }
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? "signal"})`);
  }
}

async function probeHealth() {
  if (!base) throw new Error("BASE_URL or NEXT_PUBLIC_BASE_URL required");
  const url = `${base}/api/health`;
  const res = await fetch(url, { headers: smokeRequestHeaders() });
  const text = await res.text();
  if (isVercelProtectionResponse({ responseUrl: res.url, body: text })) {
    throw new Error(
      `Deployment Protection at ${url}. Set VERCEL_AUTOMATION_BYPASS_SECRET or use public alias.`
    );
  }
  if (!res.ok) throw new Error(`health ${res.status} at ${url}`);
  console.log(`ok health probe ${base}`);
}

async function main() {
  const missing = [];
  if (!base) missing.push("BASE_URL");
  if (!process.env.STAGING_E2E_PASSWORD?.trim() && !process.env.STAGING_SEED_PASSWORD?.trim()) {
    missing.push("STAGING_E2E_PASSWORD");
  }
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);

  console.log(`night-preview-smoke target: ${base}`);
  await probeHealth();
  run("unit tests", "npm", ["test"]);
  run("http smoke", "node", ["scripts/e2e-smoke-http.mjs"]);
  run("staging all roles", "node", ["scripts/e2e-staging-all-roles.mjs"]);
  run("pricing preview", "node", ["scripts/e2e-pricing-preview.mjs"]);
  console.log("\nnight-preview-smoke PASSED");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
