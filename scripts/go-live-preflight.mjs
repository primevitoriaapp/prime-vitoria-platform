#!/usr/bin/env node
/**
 * Checklist automatizado pré go-live (env + smoke HTTP + lembretes).
 * Uso: npm run go-live:preflight
 *      BASE_URL=https://xxx.vercel.app npm run go-live:preflight
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnvLocal();

let fail = false;
const warn = [];

console.log("=== Go-live preflight ===\n");

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_BASE_URL"
];

const recommended = [
  "CRON_SECRET",
  "FCM_SERVER_KEY",
  "NOTIFICATION_JOB_PROCESS_SECRET",
  "ERP_JOB_PROCESS_SECRET",
  "RECONCILE_JOB_PROCESS_SECRET"
];

console.log("-- Variáveis --");
for (const key of required) {
  const v = process.env[key]?.trim();
  if (!v) {
    console.log(`MISSING: ${key}`);
    fail = true;
  } else {
    console.log(`ok ${key}`);
  }
}
for (const key of recommended) {
  const v = process.env[key]?.trim();
  if (v) console.log(`ok ${key}`);
  else {
    console.log(`warn ${key}`);
    warn.push(key);
  }
}

if (process.env.TRUST_HEADER_AUTH === "true") {
  console.log("warn TRUST_HEADER_AUTH=true (não usar em produção)");
  warn.push("TRUST_HEADER_AUTH");
}

const migDir = resolve(process.cwd(), "supabase/migrations");
if (existsSync(migDir)) {
  const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  const last = files[files.length - 1];
  console.log(`\n-- Migrações locais: ${files.length} ficheiros (última: ${last ?? "—"}) --`);
  console.log("Lembrete: npm run db:push no Supabase de staging/prod");
}

console.log("\n-- Testes unitários --");
const testRun = spawnSync("npm", ["test"], { stdio: "inherit", shell: true });
if (testRun.status !== 0) {
  fail = true;
  console.log("fail npm test");
} else {
  console.log("ok npm test");
}

const base = (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
if (base) {
  console.log(`\n-- Smoke HTTP (${base}) --`);
  const smoke = spawnSync("node", ["scripts/e2e-smoke-http.mjs"], {
    stdio: "inherit",
    env: { ...process.env, BASE_URL: base }
  });
  if (smoke.status !== 0) fail = true;
  else console.log("ok e2e-smoke-http");

  console.log("\n-- ERP env --");
  const erp = spawnSync("node", ["scripts/erp-preflight.mjs"], { stdio: "inherit" });
  if (erp.status !== 0) fail = true;

  if (process.env.STAGING_E2E_PASSWORD?.trim()) {
    console.log("\n-- Staging auth (opcional; 1 papel) --");
    console.log("Para todos os papéis: npm run test:e2e-staging-all");
    const role = process.env.STAGING_E2E_ROLE ?? "operador";
    const staging = spawnSync("node", ["scripts/e2e-staging-auth.mjs"], {
      stdio: "inherit",
      env: { ...process.env, BASE_URL: base, STAGING_E2E_ROLE: role }
    });
    if (staging.status !== 0) fail = true;
    else console.log(`ok e2e-staging-auth (${role})`);
  } else {
    console.log("\nskip staging auth (defina STAGING_E2E_PASSWORD)");
  }
} else {
  console.log("\nskip smoke HTTP (defina BASE_URL ou NEXT_PUBLIC_BASE_URL)");
}

console.log("\n-- Próximos passos manuais --");
console.log("1. git push + import Vercel → docs/VERCEL_DEPLOY.md");
console.log("2. Supabase Auth redirects: https://*.vercel.app/**");
console.log("3. npm run seed:staging (se ambiente novo)");
console.log("4. npm run test:e2e-staging-all");

if (warn.length) {
  console.log(`\nAvisos: ${warn.join(", ")}`);
}

console.log(fail ? "\nGo-live preflight FAILED" : "\nGo-live preflight OK");
process.exit(fail ? 1 : 0);
