#!/usr/bin/env node
/**
 * Detecta se o preview P1 está acessível (200) ou bloqueado (401 Vercel Authentication).
 *
 * Uso: npm run p1:check-preview
 *      VERCEL_AUTOMATION_BYPASS_SECRET=... npm run p1:check-preview
 */
import { STAGING_OFFICIAL_PREVIEW_URL } from "../src/lib/staging/official-preview.mjs";

const url = (process.env.BASE_URL ?? STAGING_OFFICIAL_PREVIEW_URL).replace(/\/$/, "");
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";

const headers = { "user-agent": "prime-p1-check-preview/1" };
if (bypass) headers["x-vercel-protection-bypass"] = bypass;

console.log(`URL: ${url}`);
if (bypass) console.log("Bypass: configurado (automação)");

let res;
try {
  res = await fetch(url, { redirect: "manual", headers });
} catch (err) {
  console.log(`\nRESULTADO: ERRO — ${err.message}`);
  process.exit(2);
}

const body = await res.text();
const isVercelAuth =
  res.status === 401 &&
  (body.includes("Authentication Required") || body.includes("Log in to Vercel"));

console.log(`HTTP: ${res.status}`);

if (res.status === 200) {
  const loginRes = await fetch(`${url}/login`, { redirect: "manual", headers });
  const loginOk = loginRes.status === 200;
  console.log(`Login page (/login): HTTP ${loginRes.status}${loginOk ? " (app Prime Vitória)" : ""}`);
  console.log("\nRESULTADO: OK — preview acessível. Abra no browser e homologue P1.");
  console.log(`  ${url}/p1-homologacao`);
  console.log(`  ${url}/staging-status`);
  console.log("Próximo: docs/AMANHA_P1.md");
  process.exit(0);
}

if (isVercelAuth) {
  console.log("\nRESULTADO: BLOQUEADO — Vercel Authentication (401)");
  console.log("Amanhã: docs/P1_VERCEL_PREVIEW_ACESSO.md");
  console.log("  1. Vercel → prime-vitoria-web → Settings → Deployment Protection → Preview");
  console.log("  2. Desactivar «Vercel Authentication»");
  console.log("  3. npm run p1:check-preview → deve mostrar HTTP 200");
  process.exit(1);
}

console.log(`\nRESULTADO: INESPERADO — HTTP ${res.status}`);
console.log("Verifique URL e rede.");
process.exit(1);
