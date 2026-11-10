import { test } from "node:test";
import assert from "node:assert/strict";
import { findScheduleConflict } from "../src/lib/dispatch/schedule-window.ts";

test("continuação: aeroporto → hotel 18:30, depois hotel → restaurante 19:25 não é conflito", () => {
  const first = { id: "a", scheduled_at: "2026-11-11T21:30:00Z", operational_status: "dispatched", planned_km: 12, origin_text: "Aeroporto de Vitória (VIX)", destination_text: "Hotel Slaviero Vitória - Av. Dante Michelini" };
  const next = { id: "b", scheduled_at: "2026-11-11T22:25:00Z", operational_status: "dispatched", planned_km: 5, origin_text: "Hotel Slaviero Vitória - Av. Dante Michelini", destination_text: "Gran Cave" };
  assert.equal(findScheduleConflict(next, [first], Date.parse("2026-11-10T12:00:00Z")), null);
  const other = { ...next, origin_text: "Shopping Vitória" };
  assert.ok(findScheduleConflict(other, [first], Date.parse("2026-11-10T12:00:00Z")));
});
