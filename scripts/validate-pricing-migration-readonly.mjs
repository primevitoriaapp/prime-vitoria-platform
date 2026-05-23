#!/usr/bin/env node
/**
 * Validação read-only pós-migration 0041 (pricing engine).
 * Não altera a base de dados.
 *
 * Uso:
 *   npm run db:validate-pricing-0041
 *   npm run db:validate-pricing-0041 -- --local   # valida DB local em vez do linked
 */
import { spawnSync } from "node:child_process";

const useLocal = process.argv.includes("--local");
const targetFlag = useLocal ? "--local" : "--linked";
const targetLabel = useLocal ? "local" : "linked (remoto)";

let failed = 0;

function run(label, sql) {
  const result = spawnSync(
    "npx",
    ["supabase", "db", "query", targetFlag, "-o", "json", sql],
    { encoding: "utf8", shell: false }
  );
  if (result.status !== 0) {
    console.log(`FAIL  ${label}`);
    console.log(result.stderr || result.stdout);
    failed++;
    return null;
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
  return payload?.rows ?? [];
}

console.log(`=== Validação read-only migration 0041 (${targetLabel}) ===\n`);

// 1. Migration history
const mig = run(
  "migration 0041 no histórico remoto",
  "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '0041';"
);
const migRow = rows(mig)[0];
if (migRow?.version === "0041") {
  ok(`migration 0041 aplicada (${migRow.name ?? "pricing_rules"})`);
} else {
  fail("migration 0041 aplicada", "versão 0041 ausente em schema_migrations");
}

// 2. Enum type
const enumRes = run(
  "enum pricing_calculation_type",
  "SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND typname = 'pricing_calculation_type';"
);
if (rows(enumRes).some((r) => r.typname === "pricing_calculation_type")) {
  ok("enum pricing_calculation_type existe");
} else {
  fail("enum pricing_calculation_type existe");
}

// 3. Table pricing_rules
const tables = run(
  "tabela pricing_rules",
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pricing_rules';"
);
if (rows(tables).some((r) => r.table_name === "pricing_rules")) {
  ok("tabela pricing_rules existe");
} else {
  fail("tabela pricing_rules existe");
}

// 4. Columns trips
const tripCols = run(
  "colunas pricing em trips",
  `SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'trips'
     AND column_name IN ('km_billable', 'pricing_rule_id', 'calculation_metadata')
   ORDER BY column_name;`
);
const tripColNames = new Set(rows(tripCols).map((r) => r.column_name));
for (const col of ["km_billable", "pricing_rule_id", "calculation_metadata"]) {
  if (tripColNames.has(col)) ok(`trips.${col}`);
  else fail(`trips.${col}`);
}

// 5. Columns trip_financials
const finCols = run(
  "colunas pricing em trip_financials",
  `SELECT column_name FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'trip_financials'
     AND column_name IN ('pricing_rule_id', 'calculation_metadata')
   ORDER BY column_name;`
);
const finColNames = new Set(rows(finCols).map((r) => r.column_name));
for (const col of ["pricing_rule_id", "calculation_metadata"]) {
  if (finColNames.has(col)) ok(`trip_financials.${col}`);
  else fail(`trip_financials.${col}`);
}

// 6. RLS pricing_rules
const rls = run(
  "RLS pricing_rules",
  `SELECT c.relrowsecurity AS rls_enabled,
          (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'pricing_rules') AS policy_count
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pricing_rules' AND c.relkind = 'r';`
);
const rlsRow = rows(rls)[0];
if (rlsRow?.rls_enabled === true || rlsRow?.rls_enabled === "t") {
  ok("pricing_rules RLS activo");
} else {
  fail("pricing_rules RLS activo");
}
const policyCount = Number(rlsRow?.policy_count ?? 0);
if (policyCount >= 2) {
  ok(`pricing_rules políticas (${policyCount})`);
} else {
  fail("pricing_rules políticas", `esperado >= 2, got ${policyCount}`);
}

const policies = run(
  "políticas pricing_rules",
  `SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pricing_rules' ORDER BY policyname;`
);
const policyNames = rows(policies).map((p) => p.policyname);
for (const expected of ["pricing_rules_tenant_read", "pricing_rules_tenant_write"]) {
  if (policyNames.includes(expected)) ok(`policy ${expected}`);
  else fail(`policy ${expected}`);
}

// 7. trips RLS regression (still 4 policies)
const tripsRls = run(
  "trips RLS (regressão)",
  `SELECT c.relrowsecurity AS rls_enabled,
          (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'trips') AS policy_count
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'trips' AND c.relkind = 'r';`
);
const tripsRow = rows(tripsRls)[0];
if (tripsRow?.rls_enabled === true || tripsRow?.rls_enabled === "t") {
  ok("trips RLS ainda activo");
} else {
  fail("trips RLS ainda activo");
}
if (Number(tripsRow?.policy_count) === 4) {
  ok("trips mantém 4 políticas");
} else {
  fail("trips mantém 4 políticas", `got ${tripsRow?.policy_count}`);
}

// 8. Index
const idx = run(
  "índice pricing_rules",
  `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pricing_rules' AND indexname = 'idx_pricing_rules_tenant_client_active';`
);
if (rows(idx).length > 0) {
  ok("índice idx_pricing_rules_tenant_client_active");
} else {
  fail("índice idx_pricing_rules_tenant_client_active");
}

console.log("");
if (failed === 0) {
  console.log("RESULTADO: PASS — migration 0041 validada.");
  process.exit(0);
}
console.log(`RESULTADO: FAIL — ${failed} verificação(ões) falharam.`);
process.exit(1);
