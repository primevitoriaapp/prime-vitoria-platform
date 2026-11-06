import { test } from "node:test";
import assert from "node:assert/strict";
import { lateKindFor } from "../src/lib/operations/late-departure-rule.ts";

const now = Date.UTC(2026, 10, 7, 0, 0);
const at = (minFromNow: number) => new Date(now + minFromNow * 60000).toISOString();
const t = (min: number, status: string, driver: string | null = "d1", pres: number | null = null) => ({
  scheduled_at: at(min),
  presentation_minutes: pres,
  operational_status: status,
  driver_id: driver
});

test("vigia de atraso: sem motorista, não saiu, não chegou", () => {
  assert.equal(lateKindFor(t(90, "approved", null), now), null);
  assert.equal(lateKindFor(t(50, "approved", null), now), "sem_motorista");
  assert.equal(lateKindFor(t(40, "accepted"), now), null);
  assert.equal(lateKindFor(t(25, "accepted"), now), "nao_saiu");
  assert.equal(lateKindFor(t(25, "dispatched"), now), "nao_saiu");
  assert.equal(lateKindFor(t(25, "on_the_way"), now), null);
  assert.equal(lateKindFor(t(-10, "on_the_way"), now), "nao_chegou");
  assert.equal(lateKindFor(t(-10, "accepted"), now), "nao_chegou");
  assert.equal(lateKindFor(t(-300, "accepted"), now), null);
  // apresentação 15 min antes: 40 min para o horário = 25 para estar no local
  assert.equal(lateKindFor(t(40, "accepted", "d1", 15), now), "nao_saiu");
});
