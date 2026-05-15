#!/usr/bin/env node
/**
 * Valida variáveis mínimas para deploy Vercel (lê process.env ou .env.local).
 * Uso: node scripts/vercel-preflight.mjs
 *      BASE_URL=https://preview.vercel.app CRON_SECRET=... node scripts/vercel-preflight.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

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

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_BASE_URL"
];

const recommended = ["CRON_SECRET", "FCM_SERVER_KEY", "ERP_JOB_PROCESS_SECRET", "NOTIFICATION_JOB_PROCESS_SECRET"];

let fail = false;
console.log("=== Vercel preflight ===\n");

for (const key of required) {
  const v = process.env[key]?.trim();
  if (!v) {
    console.log(`MISSING (required): ${key}`);
    fail = true;
  } else {
    console.log(`ok ${key}`);
  }
}

for (const key of recommended) {
  const v = process.env[key]?.trim();
  console.log(v ? `ok ${key}` : `warn ${key} (recommended)`);
}

const base = (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET?.trim();

if (base) {
  try {
    const health = await fetch(`${base}/api/health`);
    const json = await health.json();
    console.log(health.ok && json?.ok ? `ok GET ${base}/api/health` : `fail health ${health.status}`);
    if (!health.ok) fail = true;
  } catch (e) {
    console.log(`fail health: ${e.message}`);
    fail = true;
  }

  if (cronSecret && cronSecret.length >= 16) {
    try {
      const cron = await fetch(`${base}/api/cron/notifications`, {
        headers: { Authorization: `Bearer ${cronSecret}` }
      });
      console.log(cron.ok ? `ok cron notifications (${cron.status})` : `fail cron ${cron.status}`);
      if (!cron.ok) fail = true;
    } catch (e) {
      console.log(`fail cron: ${e.message}`);
    }
  }
} else {
  console.log("skip live checks (set BASE_URL or NEXT_PUBLIC_BASE_URL)");
}

console.log("\n-- ERP env --");
const erp = spawnSync("node", ["scripts/erp-preflight.mjs"], { stdio: "inherit" });
if (erp.status !== 0) fail = true;

if (process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
  console.log("ok Sentry DSN configured");
} else {
  console.log("warn SENTRY_DSN (optional monitoring)");
}

console.log(fail ? "\nPreflight FAILED" : "\nPreflight OK");
process.exit(fail ? 1 : 0);
