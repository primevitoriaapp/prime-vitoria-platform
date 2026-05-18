#!/usr/bin/env node
/**
 * Smoke HTTP contra deployment ou localhost.
 * Uso: BASE_URL=https://preview.vercel.app node scripts/e2e-smoke-http.mjs
 */
import {
  isVercelProtectionResponse,
  smokeRequestHeaders,
  vercelProtectionMessage
} from "../src/lib/deploy/smoke-http.mjs";

const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function check(name, path, expectStatus) {
  const url = `${base}${path}`;
  const res = await fetch(url, { headers: smokeRequestHeaders() });
  const text = await res.text();
  if (isVercelProtectionResponse({ responseUrl: res.url, body: text })) {
    throw new Error(vercelProtectionMessage(name, url, res.url));
  }

  const ok = Array.isArray(expectStatus) ? expectStatus.includes(res.status) : res.status === expectStatus;
  if (!ok) {
    throw new Error(`${name}: ${url} -> ${res.status} (expected ${expectStatus})\n${text.slice(0, 200)}`);
  }
  console.log(`ok ${name} (${res.status})`);
}

async function main() {
  await check("health", "/api/health", 200);
  await check("health detailed", "/api/health?detailed=1", [200, 503]);
  await check("in-app notifications unauthenticated", "/api/notifications/in-app", [401, 403]);
  await check("public track invalid token", "/api/public/track/not-a-valid-token", [400, 404]);
  console.log("e2e smoke passed");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
