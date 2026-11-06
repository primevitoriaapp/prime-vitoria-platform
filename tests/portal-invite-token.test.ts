import { test } from "node:test";
import assert from "node:assert/strict";
import { createPortalInviteToken, readPortalInviteToken } from "../src/lib/auth/portal-invite-token.ts";

test("convite do portal: vale 7 dias, recusa adulterado e vencido", () => {
  const now = Date.UTC(2026, 10, 6, 12);
  const t = createPortalInviteToken("11111111-1111-4111-8111-111111111111", now, "k");
  const ok = readPortalInviteToken(t, now + 6 * 86400_000, "k");
  assert.ok(typeof ok === "object" && ok.userId.startsWith("1111"));
  assert.equal(readPortalInviteToken(t, now + 8 * 86400_000, "k"), "expired");
  assert.equal(readPortalInviteToken(t, now, "outra"), "invalid");
  assert.equal(readPortalInviteToken(t.replace(/^./, "x"), now, "k"), "invalid");
});
