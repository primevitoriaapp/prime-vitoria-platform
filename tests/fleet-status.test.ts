import test from "node:test";
import assert from "node:assert/strict";
import { fleetStatus } from "../src/lib/drivers/fleet-status.ts";

test("fleetStatus — cores do mapa", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  assert.equal(fleetStatus("em_atendimento", null, now), "ocupado");
  assert.equal(fleetStatus("no_local", null, now), "ocupado");
  assert.equal(fleetStatus("deslocando", null, now), "deslocando");
  assert.equal(fleetStatus("online", "2026-10-29T13:30:00Z", now), "proximo");
  assert.equal(fleetStatus("online", "2026-10-29T18:00:00Z", now), "livre");
  assert.equal(fleetStatus("offline", "2026-10-29T13:00:00Z", now), "offline");
  assert.equal(fleetStatus(null, null, now), "offline");
});
