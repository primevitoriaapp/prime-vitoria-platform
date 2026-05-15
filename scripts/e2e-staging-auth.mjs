#!/usr/bin/env node
/**
 * Smoke autenticado contra staging (Supabase password grant + APIs).
 *
 * Env obrigatorias:
 *   BASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   STAGING_E2E_EMAIL, STAGING_E2E_PASSWORD
 *
 * Uso: node scripts/e2e-staging-auth.mjs
 */
const base = (process.env.BASE_URL ?? "").replace(/\/$/, "");
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const role = process.env.STAGING_E2E_ROLE ?? "operador";
const emailByRole = {
  admin: "staging-admin@example.com",
  operador: "staging-operador@example.com",
  financeiro: "staging-financeiro@example.com",
  motorista: "staging-motorista@example.com",
  cliente: "staging-cliente@example.com"
};
const email = process.env.STAGING_E2E_EMAIL ?? emailByRole[role] ?? emailByRole.operador;
const password = process.env.STAGING_E2E_PASSWORD ?? "";

function requireEnv() {
  const missing = [];
  if (!base) missing.push("BASE_URL");
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!password) missing.push("STAGING_E2E_PASSWORD");
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
}

async function signIn() {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Auth failed: ${json.error_description ?? json.msg ?? res.status}`);
  }
  return json.access_token;
}

async function apiGet(token, path) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(`${path} -> ${res.status} ${json.error?.message ?? JSON.stringify(json).slice(0, 120)}`);
  }
  return json.data;
}

async function main() {
  requireEnv();
  const token = await signIn();
  console.log("ok auth");

  await apiGet(token, "/api/auth/session");
  console.log("ok session");

  const trips = await apiGet(token, "/api/trips?page=1&pageSize=5");
  if (!Array.isArray(trips.items)) throw new Error("trips items missing");
  console.log(`ok trips (${trips.items.length} items)`);

  await apiGet(token, "/api/jobs/notifications?page=1&pageSize=5");
  console.log("ok notification jobs list");

  await apiGet(token, "/api/integrations/reconciliation-issues?status=open&pageSize=5");
  console.log("ok reconciliation issues");

  if (role === "financeiro" || role === "admin") {
    await apiGet(token, "/api/finance/receivables?status=open&pageSize=5");
    console.log("ok finance receivables");
  }

  const approvedTrip = trips.items.find((t) => t.operational_status === "approved");
  const financeTripId = approvedTrip?.id ?? trips.items[0]?.id;
  if (financeTripId && (role === "financeiro" || role === "admin")) {
    await apiGet(token, `/api/finance/trips/${financeTripId}`);
    console.log("ok finance trip summary");
  }

  await apiGet(token, "/api/audit-events?pageSize=5");
  console.log("ok audit events");

  const tripId = trips.items[0]?.id;
  if (tripId) {
    await apiGet(token, `/api/trips/${tripId}/operational-timeline`);
    console.log("ok operational timeline");
  }

  console.log("e2e staging auth passed");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
