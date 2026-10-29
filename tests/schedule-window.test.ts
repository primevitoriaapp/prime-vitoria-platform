import { test } from "node:test";
import assert from "node:assert/strict";
import { findScheduleConflict, conflictText } from "../src/lib/dispatch/schedule-window.ts";

const T = (id: string, iso: string, extra: object = {}) => ({ id, scheduled_at: iso, operational_status: "dispatched", ...extra });
const now = Date.parse("2026-10-29T12:00:00Z");

test("diária de 5h bloqueia transfer no meio dela", () => {
  const busy = [T("a", "2026-10-30T15:00:00Z", { service_mode: "diaria_5h" })];
  assert.ok(findScheduleConflict(T("n", "2026-10-30T18:00:00Z"), busy, now));
  assert.equal(findScheduleConflict(T("n", "2026-10-30T21:00:00Z"), busy, now), null);
});

test("transfers em sequência com folga passam; colados não", () => {
  const busy = [T("a", "2026-10-30T10:00:00Z", { planned_km: 20 })];
  assert.ok(findScheduleConflict(T("n", "2026-10-30T11:00:00Z"), busy, now));
  assert.equal(findScheduleConflict(T("n", "2026-10-30T12:30:00Z"), busy, now), null);
});

test("corrida para agora não vai para quem está em corrida", () => {
  const busy = [T("a", "2026-10-29T06:00:00Z", { operational_status: "in_progress" })];
  const c = findScheduleConflict(T("n", "2026-10-29T12:30:00Z"), busy, now);
  assert.ok(c);
  assert.match(conflictText(c!), /em corrida agora/);
  assert.equal(findScheduleConflict(T("n", "2026-10-31T12:30:00Z"), busy, now), null);
});

test("canceladas e finalizadas não contam", () => {
  const busy = [T("a", "2026-10-30T15:00:00Z", { operational_status: "completed" })];
  assert.equal(findScheduleConflict(T("n", "2026-10-30T15:00:00Z"), busy, now), null);
});
