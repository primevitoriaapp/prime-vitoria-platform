#!/usr/bin/env node
/**
 * Smoke pricing + teste operacional controlado (preview/staging).
 *
 * Env:
 *   BASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STAGING_E2E_PASSWORD (ou STAGING_SEED_PASSWORD)
 *
 * Uso: node scripts/e2e-pricing-preview.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const base = (process.env.BASE_URL ?? "").replace(/\/$/, "");
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const password = process.env.STAGING_E2E_PASSWORD ?? process.env.STAGING_SEED_PASSWORD ?? "";

const TENANT_ID = "a0000000-0000-0000-0000-000000000001";
const STAGING_CLIENT_ID = "c1000000-0000-4000-8000-000000000001";
const RULE_NAME = "Comexport — km mínimo 20";

function requireEnv() {
  for (const [k, v] of [
    ["BASE_URL", base],
    ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
    ["STAGING_E2E_PASSWORD", password]
  ]) {
    if (!v) throw new Error(`Missing env: ${k}`);
  }
}

async function signIn(email) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Auth ${email}: ${json.error_description ?? res.status}`);
  return json.access_token;
}

async function apiGet(token, path) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(`GET ${path} -> ${res.status} ${json.error?.message ?? ""}`);
  }
  return json.data;
}

async function apiPost(token, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(`POST ${path} -> ${res.status} ${json.error?.message ?? JSON.stringify(json).slice(0, 160)}`);
  }
  return json.data;
}

async function advanceMotoristaToCompleted(motorToken, tripId) {
  const steps = ["accepted", "on_the_way", "arrived", "in_progress", "completed"];
  for (const to_status of steps) {
    await apiPost(motorToken, `/api/trips/${tripId}/status`, { to_status });
  }
}

async function setupPricingTrip(db, { tripId, driverId, actualKm, adminId }) {
  const scheduled = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const row = {
    id: tripId,
    tenant_id: TENANT_ID,
    client_id: STAGING_CLIENT_ID,
    service_type: "Pricing test",
    scheduled_at: scheduled,
    origin_text: "Origem pricing test",
    origin_lat: -20.29,
    origin_lng: -40.3,
    destination_text: "Destino pricing test",
    destination_lat: -20.32,
    destination_lng: -40.34,
    dispatch_mode: "directed",
    operational_status: "dispatched",
    driver_id: driverId,
    passenger_name: `Pricing ${actualKm}km`,
    created_by: adminId,
    approved_by: adminId,
    approved_at: new Date().toISOString(),
    actual_km: actualKm,
    planned_km: actualKm
  };
  const { error: tErr } = await db.from("trips").upsert(row, { onConflict: "id" });
  if (tErr) throw tErr;
  await db.from("trip_financials").delete().eq("trip_id", tripId);
}

async function assertPricingOutcome(db, tripId, { kmBillable, amountClient, amountDriver }) {
  const { data: trip, error: tErr } = await db
    .from("trips")
    .select("actual_km, km_billable, pricing_rule_id, calculation_metadata")
    .eq("id", tripId)
    .single();
  if (tErr) throw tErr;

  const { data: fin, error: fErr } = await db
    .from("trip_financials")
    .select("amount_client, amount_driver, pricing_rule_id, calculation_metadata")
    .eq("trip_id", tripId)
    .maybeSingle();
  if (fErr) throw fErr;

  if (Number(trip.km_billable) !== kmBillable) {
    throw new Error(`trip ${tripId}: km_billable expected ${kmBillable}, got ${trip.km_billable}`);
  }
  if (!trip.pricing_rule_id) throw new Error(`trip ${tripId}: pricing_rule_id missing`);
  if (!trip.calculation_metadata?.source) {
    throw new Error(`trip ${tripId}: calculation_metadata missing`);
  }
  if (!fin) throw new Error(`trip ${tripId}: trip_financials missing`);
  if (Number(fin.amount_client) !== amountClient) {
    throw new Error(`trip ${tripId}: amount_client expected ${amountClient}, got ${fin.amount_client}`);
  }
  if (Number(fin.amount_driver) !== amountDriver) {
    throw new Error(`trip ${tripId}: amount_driver expected ${amountDriver}, got ${fin.amount_driver}`);
  }
  console.log(
    `ok pricing trip ${tripId.slice(0, 8)}… km_billable=${kmBillable} client=${amountClient} driver=${amountDriver}`
  );
}

async function main() {
  requireEnv();
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const financeToken = await signIn("staging-financeiro@example.com");
  const motorToken = await signIn("staging-motorista@example.com");
  const clienteToken = await signIn("staging-cliente@example.com");
  console.log("ok auth (financeiro, motorista, cliente)");

  const sessionRes = await fetch(`${base}/api/auth/session`, {
    headers: { Authorization: `Bearer ${motorToken}`, accept: "application/json" }
  });
  const sessionJson = await sessionRes.json();
  const stagingDriverId = sessionJson?.data?.driverId;
  if (!stagingDriverId) throw new Error("staging motorista driverId missing from session");

  const rules = await apiGet(
    financeToken,
    `/api/pricing/rules?client_id=${STAGING_CLIENT_ID}&pageSize=20`
  );
  if (!Array.isArray(rules.items)) throw new Error("pricing rules items missing");
  const comexport = rules.items.find((r) => r.name === RULE_NAME && r.active);
  if (!comexport) {
    throw new Error(`Regra "${RULE_NAME}" não encontrada — corra npm run seed:staging`);
  }
  if (Number(comexport.minimum_km) !== 20 || Number(comexport.price_per_km) !== 5) {
    throw new Error("Regra Comexport com parâmetros inesperados");
  }
  console.log(`ok GET /api/pricing/rules (${rules.items.length} items, Comexport activa)`);

  const { data: motorProfile } = await db
    .from("profiles")
    .select("id")
    .eq("id", sessionJson.data.userId)
    .maybeSingle();
  if (!motorProfile?.id) throw new Error("motorista profile missing");
  const driverRow = { id: stagingDriverId };
  if (!driverRow?.id) throw new Error("driver row missing");
  const { data: adminProfile } = await db
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("tenant_id", TENANT_ID)
    .limit(1)
    .maybeSingle();
  if (!adminProfile?.id) throw new Error("admin profile missing");

  const trip12 = randomUUID();
  const trip32 = randomUUID();
  await setupPricingTrip(db, { tripId: trip12, driverId: driverRow.id, actualKm: 12, adminId: adminProfile.id });
  await setupPricingTrip(db, { tripId: trip32, driverId: driverRow.id, actualKm: 32, adminId: adminProfile.id });
  console.log("ok setup pricing test trips (12 km, 32 km)");

  await advanceMotoristaToCompleted(motorToken, trip12);
  await advanceMotoristaToCompleted(motorToken, trip32);
  console.log("ok motorista completed both pricing test trips");

  await assertPricingOutcome(db, trip12, { kmBillable: 20, amountClient: 100, amountDriver: 50 });
  await assertPricingOutcome(db, trip32, { kmBillable: 32, amountClient: 160, amountDriver: 80 });

  const clienteTrips = await apiGet(clienteToken, "/api/trips?page=1&pageSize=50");
  if (!Array.isArray(clienteTrips.items)) throw new Error("cliente trips missing");
  console.log(`ok regressão cliente (${clienteTrips.items.length} trips)`);

  const motorTrips = await apiGet(motorToken, "/api/trips?page=1&pageSize=50");
  if (!Array.isArray(motorTrips.items)) throw new Error("motorista trips missing");
  console.log(`ok regressão motorista (${motorTrips.items.length} trips)`);

  console.log("e2e pricing preview passed");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
