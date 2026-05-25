#!/usr/bin/env node
/**
 * Validação staging REAL (Supabase + preview/prod URL) — sem mock UI.
 *
 * Env: BASE_URL, VERCEL_AUTOMATION_BYPASS_SECRET (preview protegido)
 *       NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *       STAGING_E2E_PASSWORD ou STAGING_SEED_PASSWORD
 *
 * Uso: npm run staging:real-check
 */
import { createClient } from "@supabase/supabase-js";
import { applyBaseUrlFallback, loadEnvFiles } from "../src/lib/deploy/env-files.mjs";
import { smokeRequestHeaders, isVercelProtectionResponse } from "../src/lib/deploy/smoke-http.mjs";
import {
  PRODUCTION_APP_URL,
  STAGING_OFFICIAL_BRANCH,
  STAGING_OFFICIAL_PREVIEW_URL
} from "../src/lib/staging/official-preview.mjs";

const TRIP_REQUESTED = "c2000000-0000-4000-8000-000000000001";
const TRIP_DISPATCHED = "c2000000-0000-4000-8000-000000000002";
const ACCOUNTS = {
  operador: "staging-operador@example.com",
  motorista: "staging-motorista@example.com",
  cliente: "staging-cliente@example.com"
};

loadEnvFiles();
applyBaseUrlFallback();

const base = (process.env.BASE_URL ?? STAGING_OFFICIAL_PREVIEW_URL).replace(/\/$/, "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const password =
  (process.env.STAGING_E2E_PASSWORD?.trim() || process.env.STAGING_SEED_PASSWORD?.trim()) ?? "";

const report = {
  url_oficial: STAGING_OFFICIAL_PREVIEW_URL,
  branch_esperada: STAGING_OFFICIAL_BRANCH,
  base_url_testada: base,
  commit_publicado: "(confirmar no Vercel deployment do PR #2 — último push na branch)",
  preview_env: {},
  supabase: {},
  utilizadores: {},
  corridas: {},
  fluxo: {},
  blockers: [],
  proximo_passo: []
};

function block(msg) {
  report.blockers.push(msg);
}

async function signIn(email) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${email}: ${json.error_description ?? json.msg ?? res.status}`);
  return json.access_token;
}

async function apiGet(token, path) {
  const res = await fetch(`${base}${path}`, {
    headers: { ...smokeRequestHeaders(), Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  const text = await res.text();
  if (isVercelProtectionResponse({ responseUrl: res.url, body: text })) {
    throw new Error("VERCEL_PROTECTION");
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path} not JSON (${res.status})`);
  }
  return { res, json };
}

function printReport() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  STAGING REAL — relatório                                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log("URL oficial smoke:", report.url_oficial);
  console.log("Branch:", report.branch_esperada);
  console.log("BASE_URL testada:", report.base_url_testada);
  if (report.base_url_testada === PRODUCTION_APP_URL.replace(/\/$/, "")) {
    console.log("⚠ AVISO: BASE_URL é PRODUÇÃO — use o alias git-cursor-pricing-en-*\n");
  }
  console.log("\n--- Preview / env ---");
  console.log(JSON.stringify(report.preview_env, null, 2));
  console.log("\n--- Supabase ---");
  console.log(JSON.stringify(report.supabase, null, 2));
  console.log("\n--- Utilizadores ---");
  console.log(JSON.stringify(report.utilizadores, null, 2));
  console.log("\n--- Corridas seed ---");
  console.log(JSON.stringify(report.corridas, null, 2));
  console.log("\n--- Fluxo operacional ---");
  console.log(JSON.stringify(report.fluxo, null, 2));
  if (report.blockers.length) {
    console.log("\n--- BLOCKERS ---");
    for (const b of report.blockers) console.log(`  ✗ ${b}`);
  }
  if (report.proximo_passo.length) {
    console.log("\n--- Próximo passo cirúrgico ---");
    for (const p of report.proximo_passo) console.log(`  → ${p}`);
  }
  console.log("");
}

async function main() {
  if (!password) block("STAGING_E2E_PASSWORD ou STAGING_SEED_PASSWORD ausente no shell");
  if (!supabaseUrl || !anonKey) block("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY ausentes");
  if (!serviceKey) block("SUPABASE_SERVICE_ROLE_KEY ausente (seed + verificação DB)");

  // Health remoto
  try {
    const hres = await fetch(`${base}/api/health?detailed=1`, { headers: smokeRequestHeaders() });
    const htext = await hres.text();
    if (isVercelProtectionResponse({ responseUrl: hres.url, body: htext })) {
      report.preview_env = { acessivel: false, motivo: "Deployment Protection 401", bypass: "VERCEL_AUTOMATION_BYPASS_SECRET" };
      block("Preview HTTP bloqueado — login Vercel no browser ou bypass secret");
      report.proximo_passo.push(
        "Vercel → Deployment Protection: adicionar membro OU VERCEL_AUTOMATION_BYPASS_SECRET em GitHub + local"
      );
    } else {
      const health = JSON.parse(htext);
      const rt = health.staging_runtime ?? {};
      report.preview_env = {
        acessivel: hres.ok && health.ok,
        http_status: hres.status,
        supabase_public: health.checks?.supabase_public,
        supabase_service: health.checks?.supabase_service,
        vercel_env: rt.vercel_env,
        base_url_host: rt.configured_base_url_host,
        vercel_url_host: rt.vercel_url_host,
        base_url_alinhada: rt.base_url_matches_deployment
      };
      if (rt.base_url_matches_deployment === false) {
        block("NEXT_PUBLIC_BASE_URL no Preview ≠ hostname do deployment");
        report.proximo_passo.push(
          `Vercel Preview: NEXT_PUBLIC_BASE_URL=${STAGING_OFFICIAL_PREVIEW_URL}`
        );
      }
      if (rt.configured_base_url_host === "prime-vitoria-web.vercel.app" && rt.vercel_env === "preview") {
        block("Preview usa URL de produção em NEXT_PUBLIC_BASE_URL");
      }
      if (!health.checks?.supabase_public) block("Preview sem Supabase público configurado");
      if (!health.checks?.supabase_service) block("Preview sem SUPABASE_SERVICE_ROLE_KEY");
    }
  } catch (e) {
    report.preview_env = { erro: String(e.message ?? e) };
    block(`Health check falhou: ${e.message ?? e}`);
  }

  if (!supabaseUrl || !serviceKey) {
    printReport();
    process.exit(report.blockers.length ? 1 : 0);
  }

  report.supabase.project_host = new URL(supabaseUrl).host;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  for (const [role, email] of Object.entries(ACCOUNTS)) {
    try {
      if (password) await signIn(email);
      report.utilizadores[role] = { email, auth: password ? "OK" : "SKIP" };
    } catch (e) {
      report.utilizadores[role] = { email, auth: "FAIL", erro: e.message };
      block(`Login ${role} falhou — correr seed: npm run seed:staging`);
    }
  }

  const { data: t1 } = await admin.from("trips").select("id, operational_status, driver_id").eq("id", TRIP_REQUESTED).maybeSingle();
  const { data: t2 } = await admin.from("trips").select("id, operational_status, driver_id").eq("id", TRIP_DISPATCHED).maybeSingle();

  report.corridas[TRIP_REQUESTED] = t1
    ? { existe: true, status: t1.operational_status, driver_id: t1.driver_id, nota: "Operador vê na agenda; motorista só após despacho" }
    : { existe: false };
  report.corridas[TRIP_DISPATCHED] = t2
    ? { existe: true, status: t2.operational_status, driver_id: t2.driver_id, nota: "Motorista vê em /driver se dispatched+driver_id" }
    : { existe: false };

  if (!t1?.id && !t2?.id) {
    block("Nenhuma corrida seed na base remota");
    report.proximo_passo.push(
      "STAGING_SEED_ENABLED=true + credenciais → npm run seed:staging (ou workflow staging-seed-remote)"
    );
  }
  if (t1 && t1.operational_status === "requested") {
    report.corridas.nota_001 =
      "c200…001 está requested — normal NÃO aparecer no /driver até operador despachar";
  }

  if (!password || report.blockers.some((b) => b.includes("Protection"))) {
    printReport();
    process.exit(report.blockers.length ? 1 : 0);
  }

  try {
    const opToken = await signIn(ACCOUNTS.operador);
    const { res: opRes, json: opJson } = await apiGet(opToken, "/api/trips?page=1&pageSize=50");
    const opItems = opJson.data?.items ?? [];
    report.fluxo.operador_lista_viagens = opRes.ok && opJson.success ? "OK" : "FAIL";
    report.fluxo.operador_ve_001 = opItems.some((t) => t.id === TRIP_REQUESTED) ? "OK" : "MISSING";
    report.fluxo.operador_ve_002 = opItems.some((t) => t.id === TRIP_DISPATCHED) ? "OK" : "MISSING";
    if (report.fluxo.operador_ve_001 === "MISSING" && t1) {
      block("Operador API não lista corrida 001 (RLS/tenant?)");
    }

    const motToken = await signIn(ACCOUNTS.motorista);
    const { res: mRes, json: mJson } = await apiGet(motToken, "/api/trips?page=1&pageSize=30");
    const mItems = mJson.data?.items ?? [];
    report.fluxo.motorista_lista = mRes.ok && mJson.success ? "OK" : "FAIL";
    const active = mItems.filter((t) =>
      ["dispatched", "accepted", "on_the_way", "arrived", "in_progress"].includes(t.operational_status)
    );
    report.fluxo.motorista_corridas_activas = active.length;
    report.fluxo.motorista_ve_001 = mItems.some((t) => t.id === TRIP_REQUESTED) ? "OK (inesperado se requested)" : "N/A";
    report.fluxo.motorista_ve_002 = mItems.some((t) => t.id === TRIP_DISPATCHED) ? "OK" : "MISSING";
    if (t2?.operational_status === "dispatched" && t2.driver_id && report.fluxo.motorista_ve_002 === "MISSING") {
      block("Motorista não vê corrida 002 despachada — verificar drivers.profile_id ↔ sessão");
      report.proximo_passo.push("Re-correr seed (cria drivers + trip 002 com driver_id)");
    }
    if (!active.length && t2?.driver_id) {
      block("Motorista sem corridas activas na API — /driver ficará vazio");
    }

    const cliToken = await signIn(ACCOUNTS.cliente);
    const { res: cRes, json: cJson } = await apiGet(cliToken, "/api/trips?page=1&pageSize=30");
    const cItems = cJson.data?.items ?? [];
    report.fluxo.cliente_lista = cRes.ok && cJson.success ? "OK" : "FAIL";
    report.fluxo.cliente_ve_seed = cItems.some((t) => t.id === TRIP_REQUESTED || t.id === TRIP_DISPATCHED) ? "OK" : "MISSING";
    if (report.fluxo.cliente_ve_seed === "MISSING" && (t1 || t2)) {
      block("Cliente não vê corridas seed — profile client_id ou RLS");
    }
  } catch (e) {
    if (e.message === "VERCEL_PROTECTION") {
      block("APIs de fluxo bloqueadas por Deployment Protection");
    } else {
      block(`Fluxo API: ${e.message ?? e}`);
    }
  }

  if (report.blockers.length === 0) {
    report.proximo_passo.push(
      `Smoke humano: ${STAGING_OFFICIAL_PREVIEW_URL} → operador despacha …001 → motorista /driver → cliente /client`
    );
  }

  printReport();
  process.exit(report.blockers.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
