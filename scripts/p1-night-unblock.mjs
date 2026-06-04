#!/usr/bin/env node
/**
 * Pacote de diagnóstico noite P1 — corre checks seguros sem secrets reais.
 *
 * Uso: npm run p1:night-unblock
 */
import { spawnSync } from "node:child_process";
import {
  PRODUCTION_APP_URL,
  STAGING_OFFICIAL_BRANCH,
  STAGING_OFFICIAL_PREVIEW_URL
} from "../src/lib/staging/official-preview.mjs";

const P1_COMMIT = "3cd8522";

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    shell: false
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  P1 NIGHT UNBLOCK — diagnóstico (sem alterar produção)       ║
╚══════════════════════════════════════════════════════════════╝
`);

console.log("── Ambientes ──");
console.log(`P1 URL:     ${STAGING_OFFICIAL_PREVIEW_URL}`);
console.log(`Produção:   ${PRODUCTION_APP_URL}  ← NÃO homologar P1 aqui`);
console.log(`Branch:     ${STAGING_OFFICIAL_BRANCH}`);
console.log(`Commit P1:  ${P1_COMMIT}`);
console.log(`Doc URL:    docs/P1_HOMOLOGACAO_URL_OFICIAL.md`);
console.log(`Amanhã:     docs/AMANHA_P1.md\n`);

console.log("── 1. Preview HTTP ──");
const preview = run("node", ["scripts/check-preview-access.mjs"]);
process.stdout.write(preview.stdout);
if (preview.stderr) process.stderr.write(preview.stderr);

console.log("\n── 2. Handoff (logins + blockers) ──");
const handoff = run("node", ["scripts/p1-homologation-handoff.mjs"]);
process.stdout.write(handoff.stdout);

const hasDb = Boolean(
  (process.env.STAGING_DATABASE_URL ?? process.env.DATABASE_URL ?? "").trim()
);
if (hasDb) {
  console.log("\n── 3. Migration 0044 (read-only) ──");
  const dbUrl = process.env.STAGING_DATABASE_URL ?? process.env.DATABASE_URL;
  const mig = run("npm", ["run", "db:validate-operational-0044"], { DATABASE_URL: dbUrl });
  process.stdout.write(mig.stdout);
  if (mig.stderr) process.stderr.write(mig.stderr);
} else {
  console.log("\n── 3. Migration 0044 ── SKIPPED (STAGING_DATABASE_URL não definida no shell)");
  console.log("   Amanhã: GitHub Actions → Staging migration 0044 → Run\n");
}

console.log("── Resumo ──");
const blockers = [];
if (preview.status !== 0) blockers.push("Preview 401 ou inacessível → P1_VERCEL_PREVIEW_ACESSO.md");
if (handoff.status !== 0) blockers.push("Secrets/seed/0044 → P1_SECRETS_CHECKLIST.md + AMANHA_P1.md");
if (!hasDb) blockers.push("Migration 0044 não validada localmente → workflow GitHub");

if (blockers.length === 0) {
  console.log("✓ Sem blockers detectados nos checks automáticos. Homologar no browser.\n");
} else {
  console.log("Blockers para amanhã:");
  for (const b of blockers) console.log(`  • ${b}`);
  console.log("");
}

process.exit(blockers.length > 0 ? 1 : 0);
