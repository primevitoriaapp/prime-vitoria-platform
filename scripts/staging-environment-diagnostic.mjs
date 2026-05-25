#!/usr/bin/env node
/**
 * Diagnóstico completo Preview/Staging (12 pontos do pedido operacional).
 *
 * Env:
 *   BASE_URL (ou resolve automático)
 *   VERCEL_AUTOMATION_BYPASS_SECRET (preview protegido)
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   STAGING_E2E_PASSWORD ou STAGING_SEED_PASSWORD
 *
 * Uso: npm run staging:diagnostic
 */
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { applyBaseUrlFallback, loadEnvFiles } from "../src/lib/deploy/env-files.mjs";
import { smokeRequestHeaders, isVercelProtectionResponse } from "../src/lib/deploy/smoke-http.mjs";
import {
  PRODUCTION_APP_URL,
  STAGING_OFFICIAL_BRANCH,
  STAGING_OFFICIAL_PREVIEW_URL
} from "../src/lib/staging/official-preview.mjs";

const OFFICIAL_URL = STAGING_OFFICIAL_PREVIEW_URL.replace(/\/$/, "");
const TRIP_ID = "c2000000-0000-4000-8000-000000000001";

loadEnvFiles();
applyBaseUrlFallback();
const ROLES = [
  { role: "operador", email: "staging-operador@example.com" },
  { role: "motorista", email: "staging-motorista@example.com" },
  { role: "cliente", email: "staging-cliente@example.com" }
];

const report = {
  generated_at: new Date().toISOString(),
  items: {},
  blockers: [],
  warnings: [],
  fixes_required: []
};

function setItem(key, status, detail) {
  report.items[key] = { status, detail };
}

function ghJson(args) {
  const r = spawnSync("gh", ["api", ...args], { encoding: "utf8" });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

async function fetchJson(path, { token } = {}) {
  const base = report.items["1_preview_url"]?.detail?.url ?? "";
  const url = `${base}${path}`;
  const headers = { ...smokeRequestHeaders(), accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, redirect: "follow" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { res, text, json, url };
}

async function signIn(email, password) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error_description ?? json.msg ?? `auth ${res.status}`);
  }
  return json.access_token;
}

async function main() {
  const base =
    (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "") ||
    OFFICIAL_URL;

  // 1 URL
  const isProdUrl = base === PRODUCTION_APP_URL.replace(/\/$/, "");
  setItem("1_preview_url", isProdUrl ? "FAIL" : "OK", {
    url: base,
    official_preview: STAGING_OFFICIAL_PREVIEW_URL,
    production_url: PRODUCTION_APP_URL,
    note: isProdUrl
      ? "Está a usar produção — smoke MVP deve usar o alias git-cursor-pricing-en-*"
      : base === OFFICIAL_URL.replace(/\/$/, "")
        ? "URL oficial documentada"
        : "URL diferente do alias oficial — confirmar no comentário Vercel do PR #2"
  });
  if (isProdUrl) {
    report.blockers.push("BASE_URL aponta para produção (main), não para preview da branch cursor");
  }

  // 2 branch 3 commit (git/gh)
  const branch = STAGING_OFFICIAL_BRANCH;
  let commit = null;
  const pr = ghJson(["repos/primevitoriaapp/prime-vitoria-platform/pulls/2", "-q", "headRefOid,headRefName"]);
  if (pr) {
    commit = typeof pr === "string" ? null : pr.headRefOid;
    setItem("2_branch", "OK", { branch: pr.headRefName ?? branch, expected: branch });
    setItem("3_commit", "OK", { sha: commit, short: commit?.slice(0, 7) });
  } else {
    setItem("2_branch", "WARN", { branch, note: "gh indisponível — branch esperada documentada" });
    setItem("3_commit", "WARN", { note: "confirme no dashboard Vercel do deployment Ready" });
  }

  // 4–7 env local (Vercel só visível via health remoto)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const password = process.env.STAGING_E2E_PASSWORD?.trim() || process.env.STAGING_SEED_PASSWORD?.trim();
  const trustLocal = process.env.TRUST_HEADER_AUTH?.trim();

  setItem("4_env_vars_local", supabaseUrl && anon && service ? "OK" : "PARTIAL", {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(supabaseUrl),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(anon),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(service),
    note: "Valores no deployment Vercel: ver health staging_runtime + dashboard"
  });
  if (!supabaseUrl || !anon) report.blockers.push("Supabase URL/anon ausentes no shell (necessários para testes 9–11)");

  setItem("5_supabase_keys", supabaseUrl && anon ? "OK" : "FAIL", {
    url_host: supabaseUrl ? new URL(supabaseUrl).host : null,
    anon_key_length: anon?.length ?? 0,
    service_role_configured: Boolean(service)
  });

  setItem("6_staging_e2e_password", password ? "OK" : "FAIL", {
    STAGING_E2E_PASSWORD: Boolean(process.env.STAGING_E2E_PASSWORD?.trim()),
    STAGING_SEED_PASSWORD: Boolean(process.env.STAGING_SEED_PASSWORD?.trim()),
    note: "Deve ser a mesma palavra-passe do npm run seed:staging"
  });
  if (!password) report.blockers.push("STAGING_E2E_PASSWORD/STAGING_SEED_PASSWORD ausente no shell");

  setItem("7_trust_header_auth", "INFO", {
    TRUST_HEADER_AUTH_shell: trustLocal ?? "(não definido)",
    expected_on_vercel_preview: "false ou ausente (produção usa JWT + cookies)",
    note: "Com TRUST_HEADER_AUTH=true em NODE_ENV=production, x-role funcionaria; smoke humano usa login Supabase"
  });

  // Health + protection
  const health = await fetchJson("/api/health?detailed=1");
  if (isVercelProtectionResponse({ responseUrl: health.res.url, body: health.text })) {
    setItem("11_apis", "BLOCKED", { protection: true });
    report.blockers.push(
      "Deployment Protection (401) — autentique no Vercel no browser OU defina VERCEL_AUTOMATION_BYPASS_SECRET"
    );
  } else if (!health.res.ok || !health.json?.ok) {
    setItem("11_apis", "FAIL", { health_status: health.res.status, body: health.text.slice(0, 200) });
    report.blockers.push(`Health falhou: ${health.res.status}`);
  } else {
    const c = health.json.checks ?? {};
    const rt = health.json.staging_runtime ?? {};
    setItem("4_env_vars_remote", c.supabase_public && c.supabase_service ? "OK" : "FAIL", {
      supabase_public: c.supabase_public,
      supabase_service: c.supabase_service,
      staging_runtime: rt
    });
    if (rt.base_url_matches_deployment === false) {
      report.warnings.push(
        `NEXT_PUBLIC_BASE_URL (${rt.configured_base_url_host}) ≠ VERCEL_URL (${rt.vercel_url_host}) — redirects Supabase podem falhar`
      );
      report.fixes_required.push(
        "Vercel Preview: NEXT_PUBLIC_BASE_URL = URL deste deployment (alias git-cursor-pricing-en-...)"
      );
    }
    if (rt.configured_base_url_host === "prime-vitoria-web.vercel.app" && rt.vercel_env === "preview") {
      report.blockers.push("Preview usa NEXT_PUBLIC_BASE_URL de produção — corrigir nas env vars Preview");
    }
    setItem("7_trust_header_auth_remote", "OK", {
      trust_header_auth: rt.trust_header_auth,
      vercel_env: rt.vercel_env,
      node_env: rt.node_env
    });
    setItem("11_health", "OK", { checks: c, staging_runtime: rt });
  }

  // 8 seed + 9 users + 10 trip (precisa Supabase + password)
  if (supabaseUrl && service && password && !report.blockers.some((b) => b.includes("Protection"))) {
    const admin = createClient(supabaseUrl, service, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const usersOk = [];
    for (const { role, email } of ROLES) {
      try {
        await signIn(email, password);
        usersOk.push(role);
      } catch (e) {
        usersOk.push(`${role}:FAIL(${e.message})`);
      }
    }
    const allUsers = usersOk.every((u) => !String(u).includes("FAIL"));
    setItem("9_staging_users", allUsers ? "OK" : "FAIL", { results: usersOk });
    if (!allUsers) {
      report.blockers.push("Utilizadores staging não autenticam — executar npm run seed:staging no projeto Supabase ligado ao preview");
      report.fixes_required.push(
        "STAGING_SEED_ENABLED=true + STAGING_SEED_PASSWORD + service role → npm run seed:staging"
      );
    }

    const { data: trip, error: tripErr } = await admin.from("trips").select("id, operational_status").eq("id", TRIP_ID).maybeSingle();
    setItem("10_seed_trip", trip && !tripErr ? "OK" : "FAIL", {
      trip_id: TRIP_ID,
      found: Boolean(trip),
      status: trip?.operational_status ?? null,
      error: tripErr?.message ?? null
    });
    if (!trip) {
      report.blockers.push(`Corrida seed ${TRIP_ID} ausente na base ligada ao preview`);
    }

    setItem("8_seed_executed", trip && allUsers ? "LIKELY_OK" : "FAIL", {
      note: "Inferido por users+trip; seed manual: npm run seed:staging"
    });

    // 11 APIs com token operador
    if (allUsers) {
      const token = await signIn("staging-operador@example.com", password);
      const endpoints = [
        ["/api/trips?page=1&pageSize=5", "trips"],
        ["/api/operations/queue?page=1&pageSize=5", "operations_queue"],
        ["/api/pricing/rules", "pricing_rules"]
      ];
      const apiResults = {};
      for (const [path, key] of endpoints) {
        const r = await fetchJson(path, { token });
        const ok = r.res.ok && r.json?.success !== false;
        apiResults[key] = ok ? "OK" : `FAIL ${r.res.status}`;
        if (!ok) report.warnings.push(`API ${path} → ${r.res.status}`);
      }
      setItem("11_apis_authenticated", Object.values(apiResults).every((v) => v === "OK") ? "OK" : "PARTIAL", apiResults);
    }
  } else {
    setItem("8_seed_executed", "SKIP", { reason: "sem Supabase/password ou preview bloqueado" });
    setItem("9_staging_users", "SKIP", {});
    setItem("10_seed_trip", "SKIP", {});
    setItem("11_apis_authenticated", "SKIP", {});
  }

  // 12 driver/cliente
  setItem("12_driver_client_access", "INFO", {
    causes: [
      "Login sem sessão (Supabase URL/anon errados ou password ≠ seed)",
      "Papel errado — /driver exige motorista; /client exige cliente",
      "Preview com NEXT_PUBLIC_BASE_URL de produção (cookies/redirect)",
      "Deployment Protection sem login Vercel",
      "Abrir prime-vitoria-web.vercel.app em vez do alias git-*",
      "SUPABASE_SERVICE_ROLE_KEY ausente no Vercel → login pode falhar ao ler profiles"
    ],
    smoke_urls: {
      motorista: `${base}/login?next=/driver`,
      cliente: `${base}/login?next=/client`,
      operador: `${base}/login?next=/agenda`
    }
  });

  setItem("ci_preview_smoke", "FAIL", {
    note: "Workflow Preview PR smoke não valida preview até secrets GitHub configurados",
    required_secrets: [
      "STAGING_BASE_URL",
      "STAGING_E2E_PASSWORD",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "VERCEL_AUTOMATION_BYPASS_SECRET"
    ]
  });
  report.warnings.push("CI preview-smoke está a passar sem testar o deployment (secrets vazios)");

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  DIAGNÓSTICO STAGING / PREVIEW");
  console.log("══════════════════════════════════════════════════════════\n");
  for (const [k, v] of Object.entries(report.items)) {
    console.log(`${k}: [${v.status}]`);
    console.log(JSON.stringify(v.detail, null, 2));
    console.log("");
  }
  if (report.blockers.length) {
    console.log("BLOCKERS:");
    for (const b of report.blockers) console.log(`  ✗ ${b}`);
  }
  if (report.warnings.length) {
    console.log("\nAVISOS:");
    for (const w of report.warnings) console.log(`  ⚠ ${w}`);
  }
  if (report.fixes_required.length) {
    console.log("\nCORRECÇÕES (Vercel/Supabase — humano):");
    for (const f of report.fixes_required) console.log(`  → ${f}`);
  }
  console.log("\nURL oficial smoke (copiar):");
  console.log(`  ${STAGING_OFFICIAL_PREVIEW_URL}`);
  console.log("\nDoc: docs/STAGING_PREVIEW_OFFICIAL.md\n");

  process.exit(report.blockers.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
