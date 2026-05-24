import { test, expect } from "@playwright/test";
import { publicTrackInvalidTokenStatuses } from "./helpers/ci-expectations";

test("health endpoint returns ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const json = (await res.json()) as { ok?: boolean };
  expect(json.ok).toBe(true);
});

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("public track rejects invalid token", async ({ request }) => {
  const res = await request.get("/api/public/track/not-a-valid-token-xyz");
  expect(publicTrackInvalidTokenStatuses).toContain(res.status());
});
