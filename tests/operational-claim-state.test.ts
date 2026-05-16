import test from "node:test";
import assert from "node:assert/strict";
import {
  OPERATIONAL_CLAIM_STALE_MINUTES,
  operationalClaimAgeMinutes,
  operationalClaimConflictMessage,
  operationalClaimIsStale
} from "../src/lib/trips/operational-claim-state.ts";

const reference = new Date("2026-05-16T13:00:00Z");

test("operationalClaimAgeMinutes returns elapsed whole minutes", () => {
  assert.equal(operationalClaimAgeMinutes("2026-05-16T12:30:30Z", reference), 29);
});

test("operationalClaimIsStale uses configured stale threshold", () => {
  const staleAt = new Date(reference);
  staleAt.setUTCMinutes(staleAt.getUTCMinutes() - OPERATIONAL_CLAIM_STALE_MINUTES);
  assert.equal(operationalClaimIsStale(staleAt.toISOString(), reference), true);
  assert.equal(operationalClaimIsStale("2026-05-16T12:30:00Z", reference), false);
});

test("operationalClaimConflictMessage flags stale claims", () => {
  const message = operationalClaimConflictMessage("2026-05-16T10:00:00Z");
  assert.match(message, /Claim antigo/);
});
