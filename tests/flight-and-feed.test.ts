import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flightChangeWorthAlert,
  flightCheckDue,
  flightLegForTrip,
  parseAdbTime,
  pickFlight,
  spDate
} from "../src/lib/integrations/flight-status.ts";
import { buildCalendarFeed, feedEventTitle, newFeedToken, normalizeFeedToken } from "../src/lib/integrations/calendar-feed.ts";

test("trecho do voo: buscar no aeroporto = pouso; levar = decolagem", () => {
  assert.equal(flightLegForTrip("Aeroporto de Vitória (VIX)", "Hotel Ilha do Boi"), "arrival");
  assert.equal(flightLegForTrip("Rua das Palmeiras, 10", "Aeroporto de Vitória"), "departure");
  assert.equal(flightLegForTrip("Rua A", "Rua B"), "arrival");
});

test("hora do AeroDataBox", () => {
  assert.equal(parseAdbTime({ utc: "2026-11-05 17:40Z" }), "2026-11-05T17:40:00.000Z");
  assert.equal(parseAdbTime({ utc: "" }), null);
  assert.equal(parseAdbTime(null), null);
});

const flights = [
  {
    status: "Expected",
    departure: { airport: { iata: "GRU" }, scheduledTime: { utc: "2026-11-05 10:00Z" } },
    arrival: { airport: { iata: "VIX" }, scheduledTime: { utc: "2026-11-05 11:30Z" }, revisedTime: { utc: "2026-11-05 12:05Z" } }
  },
  {
    status: "Expected",
    departure: { airport: { iata: "VIX" }, scheduledTime: { utc: "2026-11-05 20:00Z" } },
    arrival: { airport: { iata: "SSA" }, scheduledTime: { utc: "2026-11-05 22:00Z" } }
  }
];

test("escolhe o trecho mais perto da corrida e calcula o atraso", () => {
  const s = pickFlight(flights, "arrival", "2026-11-05T11:30:00Z");
  assert.ok(s);
  assert.equal(s.airport, "VIX");
  assert.equal(s.delayMinutes, 35);
  assert.equal(s.etaAt, "2026-11-05T12:05:00.000Z");
  const d = pickFlight(flights, "departure", "2026-11-05T18:00:00Z");
  assert.equal(d?.airport, "VIX");
  assert.equal(pickFlight(flights, "arrival", "2026-11-07T11:30:00Z"), null);
});

test("quando consultar (economiza a cota)", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const base = { checkCount: 0, status: null, now };
  assert.equal(flightCheckDue({ ...base, scheduledAt: "2026-11-05T18:00:00Z", checkedAt: null }), false); // 8h antes
  assert.equal(flightCheckDue({ ...base, scheduledAt: "2026-11-05T14:00:00Z", checkedAt: null }), true);
  assert.equal(flightCheckDue({ ...base, scheduledAt: "2026-11-05T14:00:00Z", checkedAt: "2026-11-05T09:00:00Z" }), false); // 60<90
  assert.equal(flightCheckDue({ ...base, scheduledAt: "2026-11-05T10:40:00Z", checkedAt: "2026-11-05T09:44:00Z" }), true); // 16>=15
  assert.equal(flightCheckDue({ ...base, scheduledAt: "2026-11-05T10:40:00Z", checkedAt: null, checkCount: 5 }), false);
  assert.equal(flightCheckDue({ ...base, scheduledAt: "2026-11-05T10:40:00Z", checkedAt: null, status: "Arrived" }), false);
});

test("avisa só mudança relevante", () => {
  const snap = { leg: "arrival" as const, status: "Expected", airport: "VIX", scheduledAt: "2026-11-05T11:30:00.000Z", etaAt: "2026-11-05T11:40:00.000Z", delayMinutes: 10 };
  assert.equal(flightChangeWorthAlert({ etaAt: null, status: null }, snap), false);
  assert.equal(flightChangeWorthAlert({ etaAt: null, status: null }, { ...snap, etaAt: "2026-11-05T12:00:00.000Z", delayMinutes: 30 }), true);
  assert.equal(flightChangeWorthAlert({ etaAt: "2026-11-05T12:00:00.000Z", status: "Delayed" }, { ...snap, etaAt: "2026-11-05T12:05:00.000Z" }), false);
  assert.equal(flightChangeWorthAlert({ etaAt: null, status: "Expected" }, { ...snap, status: "Canceled" }), true);
});

test("data local de São Paulo", () => {
  assert.equal(spDate("2026-11-06T01:30:00Z"), "2026-11-05");
});

test("link da agenda", () => {
  const t = newFeedToken();
  assert.equal(t.length, 40);
  assert.equal(normalizeFeedToken(`${t}.ics`), t);
  assert.equal(normalizeFeedToken("../etc"), null);
});

test("agenda .ics sem valores e com aviso de sem motorista", () => {
  const trip = {
    id: "11111111-2222-3333-4444-555555555555",
    scheduled_at: "2026-11-05T15:00:00Z",
    operational_status: "approved",
    origin_text: "Aeroporto de Vitória, Vitória - ES",
    destination_text: "Comexport, Cariacica - ES",
    passenger_name: "Ana; Silva",
    client_name: "Comexport — CD",
    driver_name: null,
    flight_number: "LA3345"
  };
  assert.match(feedEventTitle(trip), /sem motorista/);
  const ics = buildCalendarFeed([trip], { appUrl: "https://x.test", now: new Date("2026-11-03T00:00:00Z") });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART:20261105T150000Z/);
  assert.match(ics, /Ana\\; Silva/);
  assert.doesNotMatch(ics, /R\$/);
});
