import test from "node:test";
import assert from "node:assert/strict";
import { confirmDriverStatusTransition } from "../src/lib/trips/driver-status-confirm.ts";

test("confirmDriverStatusTransition allows without window (SSR/tests)", () => {
  assert.equal(confirmDriverStatusTransition("accepted"), true);
  assert.equal(confirmDriverStatusTransition("on_the_way"), true);
});
