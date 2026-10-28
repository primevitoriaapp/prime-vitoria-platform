import test from "node:test";
import assert from "node:assert/strict";
import { CLIENT_STATUS, isUpcomingForClient, tripShortNumber } from "../src/lib/client/client-status.ts";

test("status do cliente em linguagem simples", () => {
  assert.equal(CLIENT_STATUS.requested.label, "Aguardando confirmação");
  assert.equal(CLIENT_STATUS.completed.label, "Concluída");
});

test("isUpcomingForClient separa próximas de histórico", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  assert.equal(isUpcomingForClient("requested", "2026-10-29T19:00:00Z", now), true);
  assert.equal(isUpcomingForClient("completed", "2026-10-29T19:00:00Z", now), false);
  assert.equal(isUpcomingForClient("approved", "2026-06-10T10:00:00Z", now), false);
  assert.equal(isUpcomingForClient("in_progress", "2026-10-27T10:00:00Z", now), true);
  assert.equal(tripShortNumber("2ba377aa-8b00"), "2BA377AA");
});
