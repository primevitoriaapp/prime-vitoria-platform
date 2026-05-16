#!/usr/bin/env node
/**
 * Smoke autenticado contra staging (Supabase password grant + APIs).
 *
 * Env obrigatorias:
 *   BASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   STAGING_E2E_PASSWORD
 *   STAGING_E2E_ROLE (admin | operador | financeiro | motorista | cliente)
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

async function apiGet(token, path, { allowStatuses } = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" }
  });
  const json = await res.json().catch(() => ({}));
  if (allowStatuses?.includes(res.status)) {
    return { skipped: true, status: res.status };
  }
  if (!res.ok || !json.success) {
    throw new Error(`${path} -> ${res.status} ${json.error?.message ?? JSON.stringify(json).slice(0, 120)}`);
  }
  return json.data;
}

async function apiGetExpectForbidden(token, path) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" }
  });
  if (res.status !== 403) {
    const json = await res.json().catch(() => ({}));
    throw new Error(`${path} expected 403, got ${res.status} ${json.error?.message ?? ""}`);
  }
}

async function main() {
  requireEnv();
  const token = await signIn();
  console.log(`ok auth (${role})`);

  const session = await apiGet(token, "/api/auth/session");
  if (session?.role && session.role !== role) {
    console.warn(`warn session.role=${session.role} expected ${role}`);
  }
  console.log("ok session");

  const trips = await apiGet(token, "/api/trips?page=1&pageSize=20");
  if (!Array.isArray(trips.items)) throw new Error("trips items missing");
  console.log(`ok trips (${trips.items.length} items)`);

  const operationalRoles = ["admin", "operador", "financeiro"];
  const tripReaderRoles = [...operationalRoles, "motorista", "cliente"];

  if (role === "admin" || role === "operador") {
    await apiGet(token, "/api/operations/queue?page=1&pageSize=5");
    console.log("ok operations queue");
    const st = encodeURIComponent(new Date(Date.now() + 864e5).toISOString());
    await apiGet(token, `/api/operations/queue?page=1&pageSize=5&scheduled_to=${st}`);
    console.log("ok operations queue (scheduled_to window)");
  }

  const inAppReaderRoles = ["admin", "operador", "financeiro"];
  if (inAppReaderRoles.includes(role)) {
    const inApp = await apiGet(token, "/api/notifications/in-app?page=1&pageSize=10");
    if (!Array.isArray(inApp.items)) throw new Error("in-app notifications items missing");
    console.log(`ok in-app notifications (${inApp.items.length} items, unread ${inApp.unreadCount ?? 0})`);
  } else {
    await apiGetExpectForbidden(token, "/api/notifications/in-app?page=1&pageSize=5");
    console.log("ok in-app notifications forbidden");
  }

  if (operationalRoles.includes(role)) {
    await apiGet(token, "/api/jobs/notifications?page=1&pageSize=5");
    console.log("ok notification jobs list");

    await apiGet(token, "/api/integrations/reconciliation-issues?status=open&pageSize=5");
    console.log("ok reconciliation issues");

    if (role === "financeiro" || role === "admin") {
      await apiGet(token, "/api/integrations/webhooks/inbox?status=pending&pageSize=5");
      console.log("ok webhook inbox");
    }

    await apiGet(token, "/api/audit-events?pageSize=5");
    console.log("ok audit events");
  } else {
    await apiGetExpectForbidden(token, "/api/audit-events?pageSize=5");
    console.log("ok audit forbidden");
  }

  if (role === "financeiro" || role === "admin") {
    await apiGet(token, "/api/finance/receivables?status=open&pageSize=5");
    console.log("ok finance receivables");

    await apiGet(token, "/api/finance/driver-payables?status=open&pageSize=5");
    console.log("ok driver payables");

    const now = new Date();
    const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    await apiGet(
      token,
      `/api/finance/closings?period_start=${periodStart}&period_end=${periodEnd}&pageSize=5`
    );
    console.log("ok financial closings list");

    await apiGet(
      token,
      `/api/finance/summary/dre?period_start=${periodStart}&period_end=${periodEnd}`
    );
    console.log("ok DRE summary");

    await apiGet(token, "/api/reports/operations/trips?pageSize=5");
    console.log("ok operations report json");

    const csvRes = await fetch(`${base}/api/reports/operations/trips?format=csv&pageSize=5`, {
      headers: { Authorization: `Bearer ${token}`, accept: "text/csv" }
    });
    const csvBody = await csvRes.text();
    if (!csvRes.ok || !csvBody.startsWith("id,")) {
      throw new Error(`operations report csv -> ${csvRes.status} ${csvBody.slice(0, 80)}`);
    }
    console.log("ok operations report csv");
  } else if (role === "operador") {
    await apiGetExpectForbidden(token, "/api/finance/receivables?status=open&pageSize=5");
    console.log("ok finance receivables forbidden");

    await apiGetExpectForbidden(token, "/api/reports/operations/trips?pageSize=5");
    console.log("ok operations report forbidden");
  } else if (role === "motorista" || role === "cliente") {
    await apiGetExpectForbidden(token, "/api/reports/operations/trips?pageSize=5");
    console.log("ok operations report forbidden");
  }

  const approvedTrip = trips.items.find((t) => t.operational_status === "approved");
  const financeTripId = approvedTrip?.id ?? trips.items[0]?.id;

  if (financeTripId && (role === "financeiro" || role === "admin")) {
    const summary = await apiGet(token, `/api/finance/trips/${financeTripId}`);
    if (summary?.financial == null && summary?.receivable == null) {
      console.warn("warn finance trip summary without financial block");
    }
    console.log("ok finance trip summary");
  }

  if (financeTripId && operationalRoles.includes(role)) {
    const fs = await apiGet(token, `/api/trips/${financeTripId}/finance-summary`);
    if (role === "operador" && fs?.financial != null) {
      throw new Error("operador must not receive financial amounts in finance-summary");
    }
    if (fs?.can_enqueue_erp !== true && role === "operador") {
      throw new Error("operador expected can_enqueue_erp in finance-summary");
    }
    console.log("ok finance-summary");
  }

  if (financeTripId && role === "operador") {
    await apiGet(token, "/api/integrations/jobs?page=1&pageSize=5");
    console.log("ok erp jobs list");
  }

  if (role === "financeiro" || role === "operador" || role === "admin") {
    await apiGet(token, "/api/integrations/status");
    console.log("ok erp integration status");
  }

  if (role === "operador" || role === "admin") {
    await apiGet(token, "/api/operations/history?page=1&pageSize=5&days=7");
    console.log("ok operations history");
    await apiGet(token, "/api/operations/history?page=1&pageSize=5&days=7&status=completed");
    console.log("ok operations history (completed filter)");
    const csvRes = await fetch(`${base}/api/operations/history?format=csv&days=5`, {
      headers: { Authorization: `Bearer ${token}`, accept: "text/csv" }
    });
    const csvBody = await csvRes.text();
    if (!csvRes.ok || !csvBody.includes("scheduled_at")) {
      throw new Error(`operations history csv -> ${csvRes.status} ${csvBody.slice(0, 120)}`);
    }
    console.log("ok operations history csv");
  }

  const tripId = trips.items[0]?.id;
  if (tripId && tripReaderRoles.includes(role)) {
    await apiGet(token, `/api/trips/${tripId}/operational-timeline`);
    console.log("ok operational timeline");
  }

  if (role === "cliente" && trips.items.length < 1) {
    throw new Error("cliente expected at least one own trip from seed");
  }

  if (role === "motorista") {
    const payables = await apiGet(token, "/api/finance/driver-payables?pageSize=5");
    if (!Array.isArray(payables.items)) throw new Error("motorista driver payables items missing");
    console.log(`ok motorista driver payables (${payables.items.length} items)`);

    const assigned = trips.items.filter((t) => t.driver_id);
    if (assigned.length < 1) {
      console.warn("warn motorista: no assigned trips (assign driver_id in seed for staging)");
    } else {
      console.log(`ok motorista assigned trips (${assigned.length})`);
    }
  }

  console.log(`e2e staging auth passed (${role})`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
