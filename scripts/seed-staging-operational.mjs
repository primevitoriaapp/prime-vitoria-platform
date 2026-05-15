/**
 * Seed idempotente para ambiente de staging / testes operacionais.
 *
 * Requisitos:
 *   STAGING_SEED_ENABLED=true
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STAGING_SEED_PASSWORD  (mín. 12 caracteres; mesma palavra-passe para os 4 utilizadores de teste)
 *
 * Não executar contra produção sem consciência explícita do risco.
 *
 * Uso: npm run seed:staging
 */

import { createClient } from "@supabase/supabase-js";

const TENANT_ID = "a0000000-0000-0000-0000-000000000001";
const STAGING_CLIENT_ID = "c1000000-0000-4000-8000-000000000001";
const STAGING_TRIP_REQUESTED = "c2000000-0000-4000-8000-000000000001";
const STAGING_TRIP_APPROVED = "c2000000-0000-4000-8000-000000000002";

const ACCOUNTS = [
  { key: "admin", email: "staging-admin@example.com", name: "Admin Staging", role: "admin" },
  { key: "operador", email: "staging-operador@example.com", name: "Operador Staging", role: "operador" },
  { key: "financeiro", email: "staging-financeiro@example.com", name: "Financeiro Staging", role: "financeiro" },
  { key: "motorista", email: "staging-motorista@example.com", name: "Motorista Staging", role: "motorista" },
  { key: "cliente", email: "staging-cliente@example.com", name: "Cliente Staging", role: "cliente" }
];

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function findUserIdByEmail(admin, email) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}

async function ensureAuthUser(admin, email, password, role) {
  const existing = await findUserIdByEmail(admin, email);
  if (existing) return existing;

  const { data, error } = await admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { role, full_name: email.split("@")[0] }
  });
  if (error) {
    const again = await findUserIdByEmail(admin, email);
    if (again) return again;
    throw error;
  }
  return data.user.id;
}

async function main() {
  if (process.env.STAGING_SEED_ENABLED !== "true") {
    console.error("Refused: set STAGING_SEED_ENABLED=true to run staging seed.");
    process.exit(1);
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const password = requireEnv("STAGING_SEED_PASSWORD");
  if (password.length < 12) {
    throw new Error("STAGING_SEED_PASSWORD must be at least 12 characters");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const admin = supabase.auth.admin;
  const db = supabase;

  console.log("[seed] Ensuring staging client…");
  const { error: clientErr } = await db.from("clients").upsert(
    {
      id: STAGING_CLIENT_ID,
      tenant_id: TENANT_ID,
      type: "PJ",
      name: "Cliente corporativo (staging)",
      document: "00000000000199",
      email: "financeiro-staging@example.com",
      active: true
    },
    { onConflict: "id" }
  );
  if (clientErr) throw clientErr;

  const ids = {};
  for (const acc of ACCOUNTS) {
    console.log(`[seed] User ${acc.email} (${acc.role})…`);
    const uid = await ensureAuthUser(admin, acc.email, password, acc.role);
    ids[acc.key] = uid;

    const row = {
      id: uid,
      name: acc.name,
      role: acc.role,
      tenant_id: TENANT_ID,
      active: true,
      client_id: acc.role === "cliente" ? STAGING_CLIENT_ID : null,
      phone: null
    };
    const { error: pe } = await db.from("profiles").upsert(row, { onConflict: "id" });
    if (pe) throw pe;
  }

  console.log("[seed] Driver row for motorista…");
  const motoristaId = ids.motorista;
  const cpfMotorista = "52998224725";
  const { error: dErr } = await db.from("drivers").upsert(
    {
      profile_id: motoristaId,
      tenant_id: TENANT_ID,
      cpf: cpfMotorista,
      cnh_number: "SEED0001",
      active: true
    },
    { onConflict: "profile_id" }
  );
  if (dErr) throw dErr;

  const { data: driverRow, error: driverLookupErr } = await db
    .from("drivers")
    .select("id")
    .eq("profile_id", motoristaId)
    .maybeSingle();
  if (driverLookupErr) throw driverLookupErr;
  if (!driverRow?.id) throw new Error("Staging driver row missing after upsert");

  const adminId = ids.admin;
  const scheduled = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const scheduled2 = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

  console.log("[seed] Sample trips…");
  const tripA = {
    id: STAGING_TRIP_REQUESTED,
    tenant_id: TENANT_ID,
    client_id: STAGING_CLIENT_ID,
    service_type: "Transfer executivo",
    scheduled_at: scheduled,
    origin_text: "Aeroporto (staging)",
    origin_lat: -20.258,
    origin_lng: -40.2869,
    destination_text: "Centro corporativo (staging)",
    destination_lat: -20.3155,
    destination_lng: -40.3128,
    dispatch_mode: "offer",
    operational_status: "requested",
    passenger_name: "Convidado seed",
    created_by: adminId
  };
  const tripB = {
    id: STAGING_TRIP_APPROVED,
    tenant_id: TENANT_ID,
    client_id: STAGING_CLIENT_ID,
    service_type: "City tour",
    scheduled_at: scheduled2,
    origin_text: "Hotel staging",
    origin_lat: -20.29,
    origin_lng: -40.3,
    destination_text: "Cliente staging",
    destination_lat: -20.32,
    destination_lng: -40.34,
    dispatch_mode: "directed",
    operational_status: "approved",
    driver_id: driverRow.id,
    passenger_name: "Convidado seed 2",
    created_by: adminId,
    approved_by: adminId,
    approved_at: new Date().toISOString()
  };

  const { error: t1 } = await db.from("trips").upsert(tripA, { onConflict: "id" });
  if (t1) throw t1;
  const { error: t2 } = await db.from("trips").upsert(tripB, { onConflict: "id" });
  if (t2) throw t2;

  console.log("[seed] Financeiro sample on approved trip…");
  const { error: tfErr } = await db.from("trip_financials").upsert(
    {
      trip_id: STAGING_TRIP_APPROVED,
      amount_client: 350,
      amount_driver: 180,
      tolls: 0,
      parking: 0,
      extras: 0,
      discount: 0,
      net_margin: 170
    },
    { onConflict: "trip_id" }
  );
  if (tfErr) throw tfErr;

  const due = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10);
  const { error: arErr } = await db.from("accounts_receivable").upsert(
    {
      trip_id: STAGING_TRIP_APPROVED,
      client_id: STAGING_CLIENT_ID,
      amount: 350,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: due,
      status: "open"
    },
    { onConflict: "trip_id" }
  );
  if (arErr) throw arErr;

  console.log("\n[seed] OK. Utilizadores de teste (mesma palavra-passe = STAGING_SEED_PASSWORD):");
  for (const acc of ACCOUNTS) {
    console.log(`  - ${acc.role.padEnd(10)} ${acc.email}`);
  }
  console.log(`\nCliente staging id: ${STAGING_CLIENT_ID}`);
  console.log(`Corridas seed: ${STAGING_TRIP_REQUESTED} (requested), ${STAGING_TRIP_APPROVED} (approved)\n`);

  if (process.env.STAGING_SEED_RESET_PASSWORD === "true") {
    console.log("[seed] STAGING_SEED_RESET_PASSWORD=true → atualizando palavras-passe…");
    for (const acc of ACCOUNTS) {
      const uid = await findUserIdByEmail(admin, acc.email);
      if (uid) {
        const { error } = await admin.updateUserById(uid, { password });
        if (error) console.warn(acc.email, error.message);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
