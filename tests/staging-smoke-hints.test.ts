import test from "node:test";
import assert from "node:assert/strict";
import {
  isStagingSmokeHintsEnabled,
  STAGING_SMOKE_TRIP_REQUESTED_ID
} from "../src/lib/staging/smoke-hints.ts";

test("staging smoke hints off by default", () => {
  const prev = process.env.NEXT_PUBLIC_STAGING_SMOKE_HINTS;
  delete process.env.NEXT_PUBLIC_STAGING_SMOKE_HINTS;
  try {
    assert.equal(isStagingSmokeHintsEnabled(), false);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_STAGING_SMOKE_HINTS;
    else process.env.NEXT_PUBLIC_STAGING_SMOKE_HINTS = prev;
  }
});

test("staging smoke hints on when env true", () => {
  const prev = process.env.NEXT_PUBLIC_STAGING_SMOKE_HINTS;
  process.env.NEXT_PUBLIC_STAGING_SMOKE_HINTS = "true";
  try {
    assert.equal(isStagingSmokeHintsEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_STAGING_SMOKE_HINTS;
    else process.env.NEXT_PUBLIC_STAGING_SMOKE_HINTS = prev;
  }
});

test("official trip id constant", () => {
  assert.match(STAGING_SMOKE_TRIP_REQUESTED_ID, /^c2000000-/);
});
