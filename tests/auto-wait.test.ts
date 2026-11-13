import { test } from "node:test";
import assert from "node:assert/strict";
import { autoWaitMinutes } from "../src/lib/trips/auto-wait.ts";

test("chegou antes do horário: espera conta a partir do horário marcado", () => {
  assert.equal(autoWaitMinutes("2026-11-13T21:40:00Z", "2026-11-13T22:00:00Z", new Date("2026-11-13T22:18:00Z")), 18);
});
test("chegou atrasado: conta a partir da chegada", () => {
  assert.equal(autoWaitMinutes("2026-11-13T22:05:00Z", "2026-11-13T22:00:00Z", new Date("2026-11-13T22:12:30Z")), 7);
});
test("embarcou antes do horário: zero", () => {
  assert.equal(autoWaitMinutes("2026-11-13T21:40:00Z", "2026-11-13T22:00:00Z", new Date("2026-11-13T21:55:00Z")), 0);
});
