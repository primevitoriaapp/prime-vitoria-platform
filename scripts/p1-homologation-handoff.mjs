#!/usr/bin/env node
/**
 * Cartão de entrega P1 — ambiente de homologação operacional.
 *
 * Imprime URL, logins, estado da migration 0044 e blockers.
 * Com credenciais no ambiente, valida acesso preview + DB + auth seed.
 *
 * Uso:
 *   npm run p1:homologation:handoff
 *   BASE_URL=... STAGING_E2E_PASSWORD=... DATABASE_URL=... npm run p1:homologation:handoff
 */
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_APP_URL,
  STAGING_OFFICIAL_BRANCH,
  STAGING_OFFICIAL_PREVIEW_URL
} from "../src/lib/staging/official-preview.mjs";
import { loadEnvFiles } from "../src/lib/deploy/env-files.mjs";

const P1_COMMIT = "3cd8522";
const VERCEL_DEPLOYMENT_URL =
  "https://vercel.com/rubens-projects2/prime-vitoria-web/b4zBDpLScquyL6hLqyAs4NxDL3cP";

const ACCOUNTS = [
  { role: "Admin", email: "staging-admin@example.com", route: "/dashboard" },
  { role: "Operador", email: "staging-operador@example.com", route: "/clients" },
  { role: "Financeiro", email: "staging-financeiro@example.com", route: "/finance" },
  { role: "Motorista", email: "staging-motorista@example.com", route: "/driver" },
  { role: "Cliente", email: "staging-cliente@example.com", route: "/client" }
];

const MANUAL_TESTS = [
  {
    pergunta: "Consigo criar um cliente da Segpro?",
    rota: "/clients",
    login: "Operador",
    passos:
      "Tipo PJ → CNPJ → Consultar (ou preencher manual) → Razão social Segpro → Registar cliente → confirmar na lista"
  },
  {
    pergunta: "Consigo cadastrar o Felipe motorista?",
    rota: "/drivers",
    login: "Operador",
    passos: "Novo motorista → nome Felipe → telefone/WhatsApp → dados operacionais → guardar"
  },
  {
    pergunta: "Consigo vincular o BYD King ao Felipe?",
    rota: "/drivers",
    login: "Operador",
    passos: "Editar Felipe → secção veículos → criar/vincular BYD King → marcar como padrão"
  },
  {
    pergunta: "Consigo despachar uma corrida?",
    rota: "/agenda",
    login: "Operador",
    passos: "Abrir corrida seed ou nova → seleccionar Felipe → veículo BYD King → despachar"
  }
];

loadEnvFiles();

const previewUrl = (process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? STAGING_OFFICIAL_PREVIEW_URL).replace(
  /\/$/,
  ""
);
const password = process.env.STAGING_E2E_PASSWORD ?? process.env.STAGING_SEED_PASSWORD ?? "";
const databaseUrl = process.env.DATABASE_URL ?? process.env.STAGING_DATABASE_URL ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";

const status = {
  preview_http: null,
  migration_0044: null,
  seed_auth: {},
  blockers: []
};

async function checkPreview() {
  const headers = {};
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  try {
    const res = await fetch(previewUrl, { redirect: "manual", headers });
    status.preview_http = res.status;
    if (res.status === 401) {
      status.blockers.push(
        "Preview inacessível (401 Vercel Authentication). Rubens: Deployment Protection → Preview → desactivar Vercel Authentication, ou abrir pelo botão Visit no painel Vercel."
      );
    } else if (res.status >= 400) {
      status.blockers.push(`Preview responde HTTP ${res.status}`);
    }
  } catch (err) {
    status.preview_http = "erro";
    status.blockers.push(`Preview inacessível: ${err.message}`);
  }
}

function checkMigration0044() {
  if (!databaseUrl) {
    status.migration_0044 = "NÃO VERIFICADA — falta DATABASE_URL ou STAGING_DATABASE_URL";
    status.blockers.push(
      "Migration 0044 não verificada. Configurar STAGING_DATABASE_URL no GitHub Actions e correr workflow Staging migration 0044."
    );
    return;
  }
  const r = spawnSync("npm", ["run", "db:validate-operational-0044"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });
  status.migration_0044 = r.status === 0 ? "PASS" : "FAIL";
  if (r.status !== 0) {
    status.blockers.push("Migration 0044 FAIL — aplicar supabase/migrations/0044_operational_cadastro_extend.sql");
  }
}

async function checkSeedAuth() {
  if (!supabaseUrl || !anonKey || !password) {
    for (const acc of ACCOUNTS) {
      status.seed_auth[acc.email] = "NÃO TESTADO — faltam credenciais Supabase ou STAGING_E2E_PASSWORD";
    }
    status.blockers.push(
      "Logins não testados. Correr seed (npm run seed:staging ou workflow Staging seed) e definir STAGING_E2E_PASSWORD."
    );
    return;
  }
  for (const acc of ACCOUNTS) {
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email: acc.email, password })
      });
      const json = await res.json();
      status.seed_auth[acc.email] = res.ok && json.access_token ? "OK" : `FALHA — ${json.error_description ?? json.msg ?? res.status}`;
      if (!res.ok) {
        status.blockers.push(`Login ${acc.role} (${acc.email}) falhou — executar seed com STAGING_SEED_RESET_PASSWORD=true se necessário.`);
      }
    } catch (err) {
      status.seed_auth[acc.email] = `ERRO — ${err.message}`;
    }
  }
}

function printHandoff() {
  const pwdLine = password
    ? `(definida no ambiente — mesma para todos os papéis staging)`
    : `(Rubens define em STAGING_SEED_PASSWORD / STAGING_E2E_PASSWORD — mín. 12 caracteres; NÃO está no repositório)`;

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  ENTREGA P1 — HOMOLOGAÇÃO OPERACIONAL (NÃO PRODUÇÃO)             ║
╚══════════════════════════════════════════════════════════════════╝

⚠  NÃO USE PARA HOMOLOGAR P1:
   ${PRODUCTION_APP_URL}
   (produção / main — interface antiga, sem cadastro P1)

✓  URL P1 (preview, branch ${STAGING_OFFICIAL_BRANCH} @ ${P1_COMMIT}):
   ${previewUrl}

✓  Link directo deployment Vercel (abrir → Visit):
   ${VERCEL_DEPLOYMENT_URL}

─── LOGINS (mesma senha para todos) ───
Senha: ${pwdLine}

| Papel     | Email                          | Rota inicial   |
|-----------|--------------------------------|----------------|
${ACCOUNTS.map((a) => `| ${a.role.padEnd(9)} | ${a.email.padEnd(30)} | ${a.route.padEnd(14)} |`).join("\n")}

─── ESTADO ACTUAL ───
Preview HTTP:        ${status.preview_http ?? "—"}
Migration 0044:      ${status.migration_0044 ?? "—"}
${ACCOUNTS.map((a) => `Auth ${a.role.padEnd(9)}: ${status.seed_auth[a.email] ?? "—"}`).join("\n")}

─── TESTES MANUAIS (critério de aprovação P1) ───
${MANUAL_TESTS.map((t, i) => `${i + 1}. ${t.pergunta}\n   Login: ${t.login} → ${t.rota}\n   ${t.passos}`).join("\n\n")}

─── EVIDÊNCIA ESPERADA ───
• 4 capturas ou 1 vídeo curto (≤2 min) percorrendo os testes acima
• Menu visível: Clientes · Motoristas · Veículos · Despacho
• Screenshot workflow migration 0044 = verde (se aplicada via CI)

Automatizado (engenharia, após preview acessível):
  PLAYWRIGHT_STAGING=1 PLAYWRIGHT_BASE_URL="${previewUrl}" \\
  STAGING_E2E_PASSWORD="..." NEXT_PUBLIC_SUPABASE_URL="..." \\
  NEXT_PUBLIC_SUPABASE_ANON_KEY="..." VERCEL_AUTOMATION_BYPASS_SECRET="..." \\
  npx playwright test e2e/p1-operational-cadastro-staging.spec.ts
  → screenshots em artifacts/p1-staging/

─── 3 ACÇÕES DO RUBENS (≈15 min, desbloqueiam homologação) ───
1. Vercel → Deployment Protection → Preview → desactivar "Vercel Authentication"
2. GitHub Secrets → STAGING_DATABASE_URL → Actions → "Staging migration 0044" → Run
3. GitHub Secrets → STAGING_E2E_PASSWORD + Supabase keys → "Staging seed (remote)" → Run
   (comunicar a senha escolhida ao tester de forma segura)

P2: BLOQUEADO até PASS integral neste ambiente.

Guia amanhã: docs/AMANHA_P1.md  ·  npm run p1:amanha
`);

  if (status.blockers.length) {
    console.log("─── BLOCKERS ───");
    for (const b of [...new Set(status.blockers)]) {
      console.log(`• ${b}`);
    }
    console.log("");
    process.exitCode = 1;
  } else {
    console.log("✓ Ambiente pronto para homologação humana. Executar testes manuais acima.\n");
  }
}

await checkPreview();
checkMigration0044();
await checkSeedAuth();
printHandoff();
