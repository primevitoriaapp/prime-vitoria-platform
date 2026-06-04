#!/usr/bin/env node
/**
 * Validação read-only pós-migration 0044 (cadastro operacional P1).
 * Não altera a base de dados.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... npm run db:validate-operational-0044
 *   npm run db:validate-operational-0044 -- --linked   # Supabase CLI linked
 */
import { spawnSync } from "node:child_process";

const useLinked = process.argv.includes("--linked");
const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

let failed = 0;

function run(label, sql) {
  let result;
  if (databaseUrl) {
    result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], {
      encoding: "utf8"
    });
  } else if (useLinked) {
    result = spawnSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", sql], {
      encoding: "utf8"
    });
  } else {
    console.log("FAIL  configuração — defina DATABASE_URL ou use --linked com Supabase CLI");
    process.exit(1);
  }

  if (result.status !== 0) {
    console.log(`FAIL  ${label}`);
    console.log(result.stderr || result.stdout);
    failed++;
    return null;
  }

  if (databaseUrl) {
    const lines = (result.stdout ?? "")
      .trim()
      .split("\n")
      .filter(Boolean);
    return { rows: lines.map((line) => ({ col: line })) };
  }

  const raw = result.stdout ?? "";
  const jsonStart = raw.indexOf("{");
  const arrStart = raw.indexOf("[");
  const start =
    jsonStart >= 0 && (arrStart < 0 || jsonStart < arrStart) ? jsonStart : arrStart >= 0 ? arrStart : -1;
  if (start < 0) {
    console.log(`FAIL  ${label} — resposta inválida`);
    failed++;
    return null;
  }
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    console.log(`FAIL  ${label} — JSON inválido`);
    failed++;
    return null;
  }
}

function ok(label) {
  console.log(`OK    ${label}`);
}

function fail(label, detail = "") {
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  failed++;
}

function rows(payload) {
  if (!payload) return [];
  if (databaseUrl) return payload.rows ?? [];
  return payload?.rows ?? payload ?? [];
}

function firstCol(payload) {
  const r = rows(payload)[0];
  if (!r) return undefined;
  if (databaseUrl) return r.col;
  return Object.values(r)[0];
}

const targetLabel = databaseUrl ? "DATABASE_URL" : "linked (remoto)";
console.log(`=== Validação read-only migration 0044 (${targetLabel}) ===\n`);

const mig = run(
  "migration 0044 no histórico",
  "SELECT version FROM supabase_migrations.schema_migrations WHERE version = '0044';"
);
const migVersion = firstCol(mig);
if (migVersion === "0044") {
  ok("migration 0044 registada em schema_migrations");
} else {
  fail("migration 0044 registada", "versão 0044 ausente (db:push ou apply-migration pode ser necessário)");
}

const columnChecks = [
  ["clients.trade_name", "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='trade_name';"],
  ["clients.whatsapp", "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='whatsapp';"],
  ["drivers.available", "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='drivers' AND column_name='available';"],
  ["drivers.operational_category", "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='drivers' AND column_name='operational_category';"],
  ["vehicles.brand", "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='vehicles' AND column_name='brand';"],
  ["driver_vehicle_links.is_default", "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_vehicle_links' AND column_name='is_default';"]
];

for (const [label, sql] of columnChecks) {
  const res = run(label, sql);
  const col = firstCol(res);
  if (col === label.split(".")[1] || col) {
    ok(`coluna ${label}`);
  } else {
    fail(`coluna ${label}`, "ausente — aplicar 0044_operational_cadastro_extend.sql");
  }
}

const mig45 = run(
  "migration 0045 no histórico",
  "SELECT version FROM supabase_migrations.schema_migrations WHERE version = '0045';"
);
const mig45Version = firstCol(mig45);
if (mig45Version === "0045") {
  ok("migration 0045 registada em schema_migrations");
} else {
  fail("migration 0045 registada", "versão 0045 ausente (db:push ou apply-migration pode ser necessário)");
}

const columnChecks45 = [
  ["drivers.photo_url", "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='drivers' AND column_name='photo_url';"],
  ["storage bucket driver-photos", "SELECT id FROM storage.buckets WHERE id = 'driver-photos';"]
];

for (const [label, sql] of columnChecks45) {
  const res = run(label, sql);
  const col = firstCol(res);
  if (col) {
    ok(`${label}`);
  } else {
    fail(`${label}`, "ausente — aplicar 0045_driver_photo_url.sql");
  }
}

const mig46 = run(
  "migration 0046 no histórico",
  "SELECT version FROM supabase_migrations.schema_migrations WHERE version = '0046';"
);
if (firstCol(mig46) === "0046") {
  ok("migration 0046 registada em schema_migrations");
} else {
  fail("migration 0046 registada", "versão 0046 ausente");
}

const res46 = run(
  "clients.service_types",
  "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='service_types';"
);
if (firstCol(res46) === "service_types") {
  ok("coluna clients.service_types");
} else {
  fail("coluna clients.service_types", "ausente — aplicar 0046_client_service_types.sql");
}

console.log("");
if (failed === 0) {
  console.log("RESULTADO: PASS — migrations 0044, 0045 e 0046 prontas para validação P1 na UI");
  process.exit(0);
}
console.log(`RESULTADO: FAIL — ${failed} verificação(ões) falharam`);
process.exit(1);
