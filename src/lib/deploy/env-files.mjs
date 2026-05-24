import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_ENV_FILES = [".env.supabase.local", ".env.vercel.local", ".env.local", ".env"];

/** Chaves cujo valor curto/placeholder não deve sobrescrever credenciais reais. */
const GUARDED_ENV_KEYS = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
]);

export function isPlaceholderEnvValue(key, value) {
  const v = (value ?? "").trim();
  if (!v) return true;
  const lower = v.toLowerCase();
  if (lower.includes("placeholder") || lower.includes("your-") || lower.includes("changeme")) return true;
  if (key === "NEXT_PUBLIC_SUPABASE_URL" && !v.includes("supabase.co")) return true;
  if (GUARDED_ENV_KEYS.has(key) && v.length < 24) return true;
  return false;
}

export function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const separator = trimmed.indexOf("=");
  if (separator < 1) return null;

  const key = trimmed.slice(0, separator).trim();
  const value = trimmed
    .slice(separator + 1)
    .trim()
    .replace(/^["']|["']$/g, "");

  return key ? { key, value } : null;
}

export function loadEnvFiles({ cwd = process.cwd(), env = process.env, files = DEFAULT_ENV_FILES } = {}) {
  const loaded = [];

  for (const file of files) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, "utf8").split("\n")) {
      const parsed = parseDotEnvLine(line);
      if (!parsed) continue;

      if (env[parsed.key]?.trim()) continue;
      if (isPlaceholderEnvValue(parsed.key, parsed.value)) continue;

      env[parsed.key] = parsed.value;
      loaded.push({ file, key: parsed.key });
    }
  }

  return loaded;
}

export function applyBaseUrlFallback(env = process.env) {
  const baseUrl = env.BASE_URL?.trim();
  if (!baseUrl || env.NEXT_PUBLIC_BASE_URL?.trim()) return false;

  env.NEXT_PUBLIC_BASE_URL = baseUrl;
  return true;
}
