/**
 * Bootstrap operacional inicial da Prime Vitória.
 *
 * Idempotente: pode ser executado novamente sem duplicar tenant, perfis,
 * cliente, motorista, veículo ou corridas de teste.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const TENANT_ID = "a0000000-0000-0000-0000-000000000001";
const ADMIN_EMAIL = "contato@primevitoria.com";
const CLIENT_ID = "b1000000-0000-4000-8000-000000000001";
const VEHICLE_ID = "b2000000-0000-4000-8000-000000000001";
const REQUESTED_TRIP_ID = "b3000000-0000-4000-8000-000000000001";
const APPROVED_TRIP_ID = "b3000000-0000-4000-8000-000000000002";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    if (!key || process.env[key]?.trim()) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function findUserByEmail(admin, email) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}

async function ensureExistingAdminUser(admin) {
  const user = await findUserByEmail(admin, ADMIN_EMAIL);
  if (!user) {
    throw new Error(`Auth user not found: ${ADMIN_EMAIL}. Crie/login este usuário no Supabase antes do bootstrap.`);
  }

  const { error } = await admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      role: "admin",
      tenant_id: TENANT_ID,
      owner_role: "ADMIN_OWNER",
      super_admin: true
    },
    user_metadata: {
      ...(user.user_metadata ?? {}),
      role: "admin",
      tenant_id: TENANT_ID,
      owner_role: "ADMIN_OWNER",
      full_name: "Admin Prime Vitória"
    }
  });
  if (error) throw error;
  return user.id;
}

async function ensureTestAuthUser(admin, email, name, role) {
  const existing = await findUserByEmail(admin, email);
  const metadata = {
    role,
    tenant_id: TENANT_ID,
    bootstrap_managed: true,
    full_name: name
  };

  if (existing) {
    const { error } = await admin.updateUserById(existing.id, {
      app_metadata: { ...(existing.app_metadata ?? {}), ...metadata },
      user_metadata: { ...(existing.user_metadata ?? {}), ...metadata }
    });
    if (error) throw error;
    return existing.id;
  }

  const password = process.env.PRIME_BOOTSTRAP_TEST_PASSWORD?.trim() || randomBytes(18).toString("base64url");
  const { data, error } = await admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: metadata,
    user_metadata: metadata
  });
  if (error) throw error;
  return data.user.id;
}

async function upsertOrThrow(db, table, row, onConflict = "id") {
  const { error } = await db.from(table).upsert(row, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function main() {
  loadEnvFile(".env.supabase.local");
  loadEnvFile(".env.vercel.local");
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const admin = db.auth.admin;

  console.log("[bootstrap] Tenant Prime Vitória...");
  await upsertOrThrow(db, "tenants", { id: TENANT_ID, name: "Prime Vitória", slug: "default" });

  console.log(`[bootstrap] Admin owner ${ADMIN_EMAIL}...`);
  const adminId = await ensureExistingAdminUser(admin);
  await upsertOrThrow(db, "profiles", {
    id: adminId,
    tenant_id: TENANT_ID,
    name: "Admin Prime Vitória",
    phone: null,
    role: "admin",
    active: true,
    client_id: null
  });

  console.log("[bootstrap] Cliente teste...");
  await upsertOrThrow(db, "clients", {
    id: CLIENT_ID,
    tenant_id: TENANT_ID,
    type: "PJ",
    name: "Cliente Teste Prime Vitória",
    document: "00000000000191",
    email: "cliente.teste@primevitoria.com",
    phone: "+55 27 0000-0000",
    active: true
  });

  const clientUserId = await ensureTestAuthUser(
    admin,
    "cliente.teste@primevitoria.com",
    "Cliente Teste Prime Vitória",
    "cliente"
  );
  await upsertOrThrow(db, "profiles", {
    id: clientUserId,
    tenant_id: TENANT_ID,
    name: "Cliente Teste Prime Vitória",
    phone: "+55 27 0000-0000",
    role: "cliente",
    active: true,
    client_id: CLIENT_ID
  });

  console.log("[bootstrap] Motorista e veículo teste...");
  const driverUserId = await ensureTestAuthUser(
    admin,
    "motorista.teste@primevitoria.com",
    "Motorista Teste Prime Vitória",
    "motorista"
  );
  await upsertOrThrow(db, "profiles", {
    id: driverUserId,
    tenant_id: TENANT_ID,
    name: "Motorista Teste Prime Vitória",
    phone: "+55 27 99999-0000",
    role: "motorista",
    active: true,
    client_id: null
  });

  await upsertOrThrow(
    db,
    "drivers",
    {
      profile_id: driverUserId,
      tenant_id: TENANT_ID,
      cpf: "00000000000",
      cnh_number: "PVTESTE001",
      cnh_category: "B",
      pix_key: "motorista.teste@primevitoria.com",
      active: true,
      operational_status: "online",
      operational_status_updated_at: new Date().toISOString()
    },
    "profile_id"
  );

  const { data: driver, error: driverErr } = await db
    .from("drivers")
    .select("id")
    .eq("profile_id", driverUserId)
    .eq("tenant_id", TENANT_ID)
    .maybeSingle();
  if (driverErr || !driver?.id) throw new Error(driverErr?.message ?? "Driver test row not found");

  await upsertOrThrow(db, "vehicles", {
    id: VEHICLE_ID,
    tenant_id: TENANT_ID,
    model: "Toyota Corolla Teste",
    plate: "PVX0T01",
    category: "Executivo",
    capacity: 4,
    color: "Preto",
    status: "available",
    active: true
  });

  const { data: activeLink, error: linkErr } = await db
    .from("driver_vehicle_links")
    .select("id")
    .eq("driver_id", driver.id)
    .eq("vehicle_id", VEHICLE_ID)
    .eq("active", true)
    .maybeSingle();
  if (linkErr) throw linkErr;
  if (!activeLink?.id) {
    const { error } = await db.from("driver_vehicle_links").insert({
      driver_id: driver.id,
      vehicle_id: VEHICLE_ID,
      active: true
    });
    if (error) throw error;
  }

  console.log("[bootstrap] Corridas/agenda teste...");
  const scheduledRequested = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const scheduledApproved = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  await upsertOrThrow(db, "trips", {
    id: REQUESTED_TRIP_ID,
    tenant_id: TENANT_ID,
    client_id: CLIENT_ID,
    service_type: "Transfer executivo teste",
    scheduled_at: scheduledRequested,
    origin_text: "Aeroporto de Vitória - teste",
    origin_lat: -20.258,
    origin_lng: -40.2869,
    destination_text: "Hotel Prime Vitória - teste",
    destination_lat: -20.3155,
    destination_lng: -40.3128,
    dispatch_mode: "offer",
    operational_status: "requested",
    financial_status: "pending",
    passenger_name: "Passageiro Teste",
    passenger_phone: "+55 27 99999-1111",
    created_by: adminId
  });

  await upsertOrThrow(db, "trips", {
    id: APPROVED_TRIP_ID,
    tenant_id: TENANT_ID,
    client_id: CLIENT_ID,
    service_type: "Agenda executiva teste",
    scheduled_at: scheduledApproved,
    origin_text: "Escritório Prime Vitória - teste",
    origin_lat: -20.29,
    origin_lng: -40.3,
    destination_text: "Cliente corporativo - teste",
    destination_lat: -20.32,
    destination_lng: -40.34,
    dispatch_mode: "directed",
    operational_status: "approved",
    financial_status: "pending",
    driver_id: driver.id,
    vehicle_id: VEHICLE_ID,
    passenger_name: "Executivo Teste",
    passenger_phone: "+55 27 99999-2222",
    created_by: adminId,
    approved_by: adminId,
    approved_at: new Date().toISOString()
  });

  console.log("[bootstrap] Configurações e auditoria inicial...");
  await upsertOrThrow(db, "dispatch_automation_settings", {
    tenant_id: TENANT_ID,
    auto_offer_on_approve: false,
    auto_direct_assign_on_approve: false,
    offer_expires_seconds: 180,
    max_offer_candidates: 5,
    require_operational_claim: false,
    updated_by: adminId
  }, "tenant_id");

  await db.from("audit_events").insert({
    tenant_id: TENANT_ID,
    actor_user_id: adminId,
    action: "tenant.bootstrap_prime_vitoria",
    entity_type: "tenant",
    entity_id: TENANT_ID,
    metadata: {
      admin_email: ADMIN_EMAIL,
      client_id: CLIENT_ID,
      driver_id: driver.id,
      requested_trip_id: REQUESTED_TRIP_ID,
      approved_trip_id: APPROVED_TRIP_ID
    }
  });

  const checks = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", TENANT_ID).eq("role", "admin"),
    db.from("clients").select("id", { count: "exact", head: true }).eq("tenant_id", TENANT_ID),
    db.from("drivers").select("id", { count: "exact", head: true }).eq("tenant_id", TENANT_ID),
    db.from("trips").select("id", { count: "exact", head: true }).eq("tenant_id", TENANT_ID)
  ]);
  for (const check of checks) {
    if (check.error) throw check.error;
  }

  console.log("\n[bootstrap] OK");
  console.log(`tenant_id=${TENANT_ID}`);
  console.log(`admin_profile=${adminId}`);
  console.log(`client_id=${CLIENT_ID}`);
  console.log(`driver_id=${driver.id}`);
  console.log(`trips=${REQUESTED_TRIP_ID},${APPROVED_TRIP_ID}`);
  console.log(
    `counts admin=${checks[0].count ?? 0} clients=${checks[1].count ?? 0} drivers=${checks[2].count ?? 0} trips=${checks[3].count ?? 0}`
  );
}

main().catch((error) => {
  console.error("[bootstrap] FAILED", error.message);
  process.exit(1);
});
