#!/usr/bin/env node
/**
 * Aplica secrets de máquina na Vercel (Production + Preview) a partir de
 * .production-secrets.local gerado por generate-production-secrets.mjs
 *
 * Não envia FCM_SERVER_KEY (definir manualmente no Firebase).
 *
 * Uso: npm run vercel:secrets:apply
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const secretsPath = path.join(root, ".production-secrets.local");

const KEYS = [
  "CRON_SECRET",
  "NOTIFICATION_JOB_PROCESS_SECRET",
  "ERP_JOB_PROCESS_SECRET",
  "RECONCILE_JOB_PROCESS_SECRET",
  "DISPATCH_DIRECT_SCAN_SECRET"
];

function parseSecretsFile(content) {
  const out = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const hash = value.indexOf("  #");
    if (hash >= 0) value = value.slice(0, hash).trim();
    if (KEYS.includes(key) && value) out[key] = value;
  }
  return out;
}

function envAdd(name, value, target) {
  const result = spawnSync("npx", ["vercel", "env", "add", name, target, "--force"], {
    cwd: root,
    input: value + "\n",
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    console.error(`FAIL ${name} (${target}): ${result.stderr || result.stdout}`);
    return false;
  }
  console.log(`ok ${name} → ${target}`);
  return true;
}

function main() {
  if (!fs.existsSync(secretsPath)) {
    console.error(`Missing ${secretsPath}`);
    console.error("Run: node scripts/generate-production-secrets.mjs --write");
    process.exit(1);
  }

  const secrets = parseSecretsFile(fs.readFileSync(secretsPath, "utf8"));
  const missing = KEYS.filter((k) => !secrets[k]);
  if (missing.length) {
    console.error("Missing keys in file:", missing.join(", "));
    process.exit(1);
  }

  console.log("Applying machine secrets to Vercel (production + preview)…\n");
  let fail = false;
  for (const key of KEYS) {
    if (!envAdd(key, secrets[key], "production")) fail = true;
    if (!envAdd(key, secrets[key], "preview")) {
      // Preview pode falhar em contas Hobby; production é o critério de go-live.
      console.warn(`warn ${key} (preview) — adicione manualmente se usar preview deployments`);
    }
  }

  console.log(fail ? "\nSome variables failed — use Vercel dashboard." : "\nDone.");
  console.log("\nManual: add FCM_SERVER_KEY + NEXT_PUBLIC_FIREBASE_* from Firebase.");
  console.log("Then redeploy: npx vercel deploy --prod");
  console.log("Verify: CRON_SECRET=... BASE_URL=https://prime-vitoria-web.vercel.app npm run vercel:preflight");
  process.exit(fail ? 1 : 0);
}

main();
