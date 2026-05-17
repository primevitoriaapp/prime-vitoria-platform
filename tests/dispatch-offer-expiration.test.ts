import test from "node:test";
import assert from "node:assert/strict";
import { dispatchOfferIsExpired } from "../src/lib/dispatch/offer-expiration.ts";

const now = new Date("2026-05-17T12:00:00.000Z");

test("dispatchOfferIsExpired checks current time inclusively", () => {
  assert.equal(dispatchOfferIsExpired("2026-05-17T11:59:59.000Z", now), true);
  assert.equal(dispatchOfferIsExpired("2026-05-17T12:00:00.000Z", now), true);
  assert.equal(dispatchOfferIsExpired("2026-05-17T12:00:01.000Z", now), false);
});

test("dispatchOfferIsExpired treats invalid dates as expired", () => {
  assert.equal(dispatchOfferIsExpired("not-a-date", now), true);
  assert.equal(dispatchOfferIsExpired("2026-05-17T12:00:00.000Z", new Date("not-a-date")), true);
});
