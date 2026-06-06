import test from "node:test";
import assert from "node:assert/strict";
import { isClientPortalReadOnly } from "../src/lib/client/portal-config.ts";

test("isClientPortalReadOnly defaults true when env unset", () => {
  const prev = process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY;
  delete process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY;
  try {
    assert.equal(isClientPortalReadOnly(), true);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY;
    else process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY = prev;
  }
});

test("isClientPortalReadOnly false only when env explicitly false", () => {
  const prev = process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY;
  for (const v of ["false", "0", "no"]) {
    process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY = v;
    assert.equal(isClientPortalReadOnly(), false, `expected false for ${v}`);
  }
  process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY = "true";
  assert.equal(isClientPortalReadOnly(), true);
  if (prev === undefined) delete process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY;
  else process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY = prev;
});

test("isClientPortalReadOnly per-client flag prevails over env", () => {
  const prev = process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY;
  process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY = "true";
  try {
    assert.equal(isClientPortalReadOnly({ portalRequestsEnabled: true }), false);
    assert.equal(isClientPortalReadOnly({ portalRequestsEnabled: false }), true);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY;
    else process.env.NEXT_PUBLIC_CLIENT_PORTAL_READ_ONLY = prev;
  }
});
