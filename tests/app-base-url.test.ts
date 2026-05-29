import test from "node:test";
import assert from "node:assert/strict";
import { resolveAppBaseUrl } from "../src/lib/server/app-base-url.ts";

test("resolveAppBaseUrl prefers VERCEL_URL on preview", () => {
  const prevV = process.env.VERCEL_URL;
  const prevB = process.env.NEXT_PUBLIC_BASE_URL;
  process.env.VERCEL_URL = "prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app";
  process.env.NEXT_PUBLIC_BASE_URL = "https://prime-vitoria-web.vercel.app";
  try {
    assert.equal(
      resolveAppBaseUrl(),
      "https://prime-vitoria-web-git-cursor-pricing-en-69d26a-rubens-projects2.vercel.app"
    );
  } finally {
    if (prevV === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevV;
    if (prevB === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_BASE_URL = prevB;
  }
});
