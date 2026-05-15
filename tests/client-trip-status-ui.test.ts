import test from "node:test";
import assert from "node:assert/strict";
import { clientShowsAwaitingApproval } from "../src/lib/client/trip-status-ui.ts";

test("clientShowsAwaitingApproval only for requested", () => {
  assert.equal(clientShowsAwaitingApproval("requested"), true);
  assert.equal(clientShowsAwaitingApproval("approved"), false);
  assert.equal(clientShowsAwaitingApproval("completed"), false);
});
