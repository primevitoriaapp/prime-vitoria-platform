import test from "node:test";
import assert from "node:assert/strict";
import { fr24AlertsToSend, fr24CheckDue, fr24Snapshot } from "../src/lib/integrations/fr24.ts";

const trip = { flight_number: "LA3243", passenger_name: "Ana", scheduled_at: "2026-12-01T17:30:00.000Z", flight_alerts: {} };

test("voando com previsão atrasada: EnRoute, atraso calculado pelo horário da corrida", () => {
  const snap = fr24Snapshot(
    [{ fr24_id: "a1", flight: "LA3243", orig_iata: "GRU", dest_iata: "VIX", datetime_takeoff: "2026-12-01T16:20:00", flight_ended: false }],
    [{ fr24_id: "a1", flight: "LA3243", dest_iata: "VIX", eta: "2026-12-01T18:10:00Z" }],
    "arrival",
    trip.scheduled_at
  );
  assert.ok(snap);
  assert.equal(snap.status, "EnRoute");
  assert.equal(snap.delayMinutes, 40);
  assert.equal(snap.airport, "VIX");
  const keys = fr24AlertsToSend(trip, snap, Date.parse("2026-12-01T16:30:00Z")).map((a) => a.key);
  assert.deepEqual(keys.sort(), ["delay", "departed"]);
});

test("pousou: um aviso de pouso só uma vez", () => {
  const snap = fr24Snapshot([{ fr24_id: "a1", dest_iata: "VIX", datetime_takeoff: "2026-12-01T16:00:00", datetime_landed: "2026-12-01T17:25:00", flight_ended: true }], [], "arrival", trip.scheduled_at);
  assert.equal(snap?.status, "Arrived");
  const first = fr24AlertsToSend(trip, snap!, Date.parse("2026-12-01T17:30:00Z"));
  assert.deepEqual(first.map((a) => a.key), ["landed"]);
  const again = fr24AlertsToSend({ ...trip, flight_alerts: { landed: true } }, snap!, Date.parse("2026-12-01T17:35:00Z"));
  assert.equal(again.length, 0);
});

test("desviado quando pousa em outro aeroporto", () => {
  const snap = fr24Snapshot([{ fr24_id: "a1", dest_iata: "VIX", dest_iata_actual: "GIG", datetime_landed: "2026-12-01T17:40:00", flight_ended: true }], [], "arrival", trip.scheduled_at);
  assert.equal(snap?.status, "Diverted");
});

test("não decolou perto do horário: avisa uma vez", () => {
  const expected = { leg: "arrival" as const, status: "Expected" as const, airport: null, departedAt: null, landedAt: null, etaAt: null, delayMinutes: null };
  assert.deepEqual(fr24AlertsToSend(trip, expected, Date.parse("2026-12-01T17:00:00Z")).map((a) => a.key), ["notakeoff"]);
  assert.equal(fr24AlertsToSend(trip, expected, Date.parse("2026-12-01T15:00:00Z")).length, 0);
});

test("levar ao aeroporto (decolagem) não gera avisos ao motorista", () => {
  const snap = fr24Snapshot([{ fr24_id: "a1", orig_iata: "VIX", datetime_takeoff: "2026-12-01T17:00:00" }], [], "departure", trip.scheduled_at);
  assert.equal(fr24AlertsToSend(trip, snap!, Date.parse("2026-12-01T17:05:00Z")).length, 0);
});

test("ritmo das consultas", () => {
  const at = "2026-12-01T17:30:00.000Z";
  const t = Date.parse(at);
  assert.equal(fr24CheckDue({ scheduledAt: at, checkedAt: null, status: null, now: t - 6 * 3600_000 }), false);
  assert.equal(fr24CheckDue({ scheduledAt: at, checkedAt: null, status: null, now: t - 4 * 3600_000 }), true);
  assert.equal(fr24CheckDue({ scheduledAt: at, checkedAt: new Date(t - 4 * 3600_000 - 10 * 60_000).toISOString(), status: "Expected", now: t - 4 * 3600_000 }), false);
  assert.equal(fr24CheckDue({ scheduledAt: at, checkedAt: new Date(t - 90 * 60_000 - 6 * 60_000).toISOString(), status: "EnRoute", now: t - 90 * 60_000 }), true);
  assert.equal(fr24CheckDue({ scheduledAt: at, checkedAt: null, status: "Arrived", now: t }), false);
});
