#!/usr/bin/env node
/**
 * Gera valores aleatórios para secrets de produção (não inclui FCM — vem do Firebase).
 *
 * Uso:
 *   node scripts/generate-production-secrets.mjs              # imprime checklist
 *   node scripts/generate-production-secrets.mjs --write      # grava .production-secrets.local (gitignored)
 *
 * Depois: copiar para Vercel (Settings → Environment Variables) ou:
 *   npm run vercel:secrets:apply   # tenta vercel env add (requer CLI autenticada)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const writeFile = process.argv.includes("--write");

const MACHINE_SECRETS = [
  { key: "CRON_SECRET", bytes: 32, note: "Crons Vercel GET /api/cron/* (mín. 16 chars)" },
  { key: "NOTIFICATION_JOB_PROCESS_SECRET", bytes: 32, note: "POST /api/jobs/notifications/process" },
  { key: "ERP_JOB_PROCESS_SECRET", bytes: 32, note: "POST /api/jobs/erp/process" },
  { key: "RECONCILE_JOB_PROCESS_SECRET", bytes: 32, note: "POST /api/jobs/reconcile/run" },
  { key: "DISPATCH_DIRECT_SCAN_SECRET", bytes: 32, note: "POST /api/jobs/dispatch-direct-scan" }
];

function gen(bytes) {
  return crypto.randomBytes(bytes).toString("base64url");
}

const lines = [];
const generated = {};

for (const { key, bytes, note } of MACHINE_SECRETS) {
  const value = gen(bytes);
  generated[key] = value;
  lines.push(`${key}=${value}  # ${note}`);
}

lines.push("");
lines.push("# --- Manual (Firebase Console) ---");
lines.push("# FCM_SERVER_KEY=<Server key em Project settings → Cloud Messaging>");
lines.push("# NEXT_PUBLIC_FIREBASE_API_KEY=...");
lines.push("# NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...");
lines.push("# NEXT_PUBLIC_FIREBASE_PROJECT_ID=...");
lines.push("# NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...");
lines.push("# NEXT_PUBLIC_FIREBASE_APP_ID=...");
lines.push("# NEXT_PUBLIC_FCM_VAPID_KEY=<Web Push certificate key pair>");

const body = [
  "# Gerado em " + new Date().toISOString(),
  "# NÃO commitar. Apagar após colar na Vercel.",
  "",
  ...lines,
  ""
].join("\n");

if (writeFile) {
  const outPath = path.join(root, ".production-secrets.local");
  fs.writeFileSync(outPath, body, { encoding: "utf8", mode: 0o600 });
  console.log(`Written ${outPath} (mode 600)`);
  console.log("Next: npm run vercel:secrets:apply  OR paste in Vercel dashboard\n");
} else {
  console.log(body);
}
