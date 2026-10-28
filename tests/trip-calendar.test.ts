import test from "node:test";
import assert from "node:assert/strict";
import { buildTripIcs, googleCalendarLink, icsEscape, tripDurationMinutes } from "../src/lib/notifications/trip-calendar.ts";

test("buildTripIcs gera convite com lembretes de 1 dia e 3 horas", () => {
  const raw = buildTripIcs({
    tripId: "abc",
    startIso: "2026-10-29T19:00:00.000Z",
    durationMinutes: 90,
    title: "Corrida Prime — Fabiano",
    description: "Embarque: Aeroporto, Vitória",
    location: "Aeroporto de Vitória",
    organizerEmail: "contato@primevitoria.com",
    attendeeEmail: "motorista@ex.com",
    now: new Date("2026-10-28T12:00:00Z")
  });
  const ics = raw.replace(/\r\n /g, "");
  assert.match(ics, /DTSTART:20261029T190000Z/);
  assert.match(ics, /DTEND:20261029T203000Z/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.match(ics, /TRIGGER:-PT3H/);
  assert.match(ics, /ATTENDEE.*mailto:motorista@ex.com/);
  assert.match(ics, /Embarque: Aeroporto\\, Vitória/);
  assert.ok(raw.includes("\r\n"));
});

test("googleCalendarLink e duração", () => {
  const link = googleCalendarLink({
    startIso: "2026-10-29T19:00:00.000Z",
    durationMinutes: 600,
    title: "Corrida",
    description: "x",
    location: "y"
  });
  assert.match(link, /dates=20261029T190000Z%2F20261030T050000Z/);
  assert.equal(tripDurationMinutes("diaria_seda"), 600);
  assert.equal(tripDurationMinutes("transfer_seda"), 90);
  assert.equal(icsEscape("a;b,c"), "a\;b\\,c");
});
