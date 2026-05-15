#!/usr/bin/env node
/**
 * Garante DISPATCH_DIRECT_SCAN_SECRET com entropia de 256 bits (production-ready).
 * - Escreve em .env.local por omissão (não versionado). Sobrescreve valores fracos/vazios.
 * - Use ENV_FILE=.env para outros ambientes (ex.: compose).
 * - --force: gira o segredo mesmo que o atual pareça forte.
 * - --print-only: imprime uma linha NAME=value para redirecionar a um secrets manager (não grava ficheiro).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const KEY = "DISPATCH_DIRECT_SCAN_SECRET";
const MIN_STRONG_LENGTH = 43; // base64url(32 bytes) length
const force = process.argv.includes("--force");
const printOnly = process.argv.includes("--print-only");

const envRel = process.env.ENV_FILE?.trim() || ".env.local";
const envPath = path.isAbsolute(envRel) ? envRel : path.join(root, envRel);

function generateSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function looksWeak(value) {
  const v = (value ?? "").trim();
  if (!v) return true;
  if (v.length < MIN_STRONG_LENGTH) return true;
  if (/^(change|secret|test|example|placeholder|\<)/i.test(v)) return true;
  return false;
}

function readEnvFile() {
  try {
    return fs.readFileSync(envPath, "utf8");
  } catch {
    return "";
  }
}

function upsertLine(body, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escapedKey}=.*`, "m");
  const line = `${key}=${value}`;
  if (re.test(body)) {
    return body.replace(re, line);
  }
  const trimmed = body.trimEnd();
  const nl = trimmed.length === 0 ? "" : "\n";
  return `${trimmed}${nl}${line}\n`;
}

const secret = generateSecret();

if (printOnly) {
  process.stdout.write(`${KEY}=${secret}\n`);
  process.exit(0);
}

let body = readEnvFile();
const reExisting = new RegExp(`^${KEY}=(.*)$`, "m");
const match = body.match(reExisting);
const current = match ? match[1].trim() : "";

if (!force && !looksWeak(current)) {
  process.stdout.write(`[ensure-dispatch-secret] ${KEY} already present in ${envRel}; use --force to rotate.\n`);
  process.exit(0);
}

body = upsertLine(body, KEY, secret);
fs.mkdirSync(path.dirname(envPath), { recursive: true });
fs.writeFileSync(envPath, body, { encoding: "utf8", mode: 0o600 });

try {
  if (process.platform !== "win32") {
    fs.chmodSync(envPath, 0o600);
  }
} catch {
  // ignore chmod failures on exotic FS
}

process.stdout.write(
  `[ensure-dispatch-secret] ${KEY} written to ${envRel} (256-bit, base64url). Do not commit this file.\n`
);
