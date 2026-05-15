#!/usr/bin/env node
/**
 * Corre smoke autenticado para cada papel de staging (sequencial).
 *
 * Mesmas env que e2e-staging-auth.mjs:
 *   BASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, STAGING_E2E_PASSWORD
 *
 * Uso: npm run test:e2e-staging-all
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const authScript = join(__dirname, "e2e-staging-auth.mjs");

const ROLES = ["admin", "operador", "financeiro", "motorista", "cliente"];

function runRole(role) {
  console.log(`\n--- role: ${role} ---`);
  const result = spawnSync(process.execPath, [authScript], {
    stdio: "inherit",
    env: { ...process.env, STAGING_E2E_ROLE: role }
  });
  if (result.status !== 0) {
    throw new Error(`e2e failed for role ${role} (exit ${result.status ?? "signal"})`);
  }
}

async function main() {
  const missing = [];
  if (!process.env.BASE_URL?.trim()) missing.push("BASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!process.env.STAGING_E2E_PASSWORD?.trim()) missing.push("STAGING_E2E_PASSWORD");
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }

  for (const role of ROLES) {
    runRole(role);
  }
  console.log("\ne2e staging all roles passed");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
