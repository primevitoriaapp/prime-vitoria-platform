import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_ENV_FILES = [".env.supabase.local", ".env.vercel.local", ".env.local", ".env"];

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
