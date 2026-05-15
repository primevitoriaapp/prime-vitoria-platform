#!/usr/bin/env node
/**
 * Verifica variáveis ERP e opcionalmente GET /api/integrations/status (com sessão admin).
 *
 * Uso:
 *   npm run erp:preflight
 *   BASE_URL=https://preview.vercel.app STAGING_E2E_PASSWORD=... npm run erp:preflight -- --http
 */
import { readFileSync, existsSync } from "node:fs";
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

const httpMode = process.argv.includes("--http");
const baseUrl = (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);

function envFlag(name) {
  return Boolean(process.env[name]?.trim());
}

console.log("=== ERP preflight ===\n");

const omieLive = envFlag("ERP_OMIE_APP_KEY") && envFlag("ERP_OMIE_APP_SECRET");
const omieCliente = envFlag("ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR");
const caLive = envFlag("ERP_CONTA_AZUL_ACCESS_TOKEN");
const caCliente = envFlag("ERP_CONTA_AZUL_ID_CLIENTE");
const caItem = envFlag("ERP_CONTA_AZUL_ID_ITEM_SERVICO");

console.log("Omie:");
console.log(`  modo: ${omieLive ? "live (credenciais API)" : "mock"}`);
console.log(`  APP_KEY/SECRET: ${omieLive ? "ok" : "ausente"}`);
console.log(`  cliente global: ${omieCliente ? "ok" : "ausente (use mapeamento POST /api/integrations/mappings)"}`);

console.log("\nConta Azul:");
console.log(`  modo: ${caLive ? "live" : "mock"}`);
console.log(`  ACCESS_TOKEN: ${caLive ? "ok" : "ausente"}`);
console.log(`  ID_CLIENTE: ${caCliente ? "ok" : "ausente"}`);
console.log(`  ID_ITEM_SERVICO: ${caItem ? "ok" : "ausente"}`);

console.log("\nWebhooks / jobs:");
console.log(`  ERP_OMIE_WEBHOOK_SECRET: ${envFlag("ERP_OMIE_WEBHOOK_SECRET") ? "ok" : "opcional"}`);
console.log(`  ERP_CONTA_AZUL_WEBHOOK_SECRET: ${envFlag("ERP_CONTA_AZUL_WEBHOOK_SECRET") ? "ok" : "opcional"}`);
console.log(`  ERP_JOB_PROCESS_SECRET: ${envFlag("ERP_JOB_PROCESS_SECRET") ? "ok" : "recomendado em prod"}`);
console.log(`  RECONCILE_JOB_PROCESS_SECRET: ${envFlag("RECONCILE_JOB_PROCESS_SECRET") ? "ok" : "recomendado"}`);

let fail = false;
if (process.env.ERP_REQUIRE_LIVE === "true") {
  if (!omieLive && !caLive) {
    console.error("\nERP_REQUIRE_LIVE=true mas nenhum provedor tem credenciais live.");
    fail = true;
  }
  if (omieLive && !omieCliente) {
    console.warn("\nAviso: Omie live sem ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR — depende de mapeamentos.");
  }
  if (caLive && (!caCliente || !caItem)) {
    console.error("\nConta Azul live exige ID_CLIENTE e ID_ITEM_SERVICO (ou mapeamentos).");
    fail = true;
  }
}

if (httpMode) {
  console.log(`\n-- HTTP ${baseUrl}/api/integrations/status --`);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const password = process.env.STAGING_E2E_PASSWORD ?? process.env.STAGING_SEED_PASSWORD;
  const email = process.env.STAGING_E2E_EMAIL ?? "staging-financeiro@example.com";

  if (!supabaseUrl || !anonKey || !password) {
    console.warn("Skip HTTP: defina Supabase + STAGING_E2E_PASSWORD (ou STAGING_SEED_PASSWORD)");
  } else {
    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error("Auth falhou:", tokenJson.error_description ?? tokenRes.status);
      fail = true;
    } else {
      const statusRes = await fetch(`${baseUrl}/api/integrations/status`, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` }
      });
      const body = await statusRes.json();
      if (!statusRes.ok) {
        console.error("GET status falhou:", body);
        fail = true;
      } else {
        console.log(JSON.stringify(body.data ?? body, null, 2));
      }
    }
  }
}

console.log(fail ? "\nERP preflight FAILED" : "\nERP preflight OK");
process.exit(fail ? 1 : 0);
