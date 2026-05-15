import { test, expect } from "@playwright/test";

test("operations report requires authentication", async ({ request }) => {
  const res = await request.get("/api/reports/operations/trips?pageSize=1");
  expect([401, 403]).toContain(res.status());
});

test("operations report CSV requires authentication", async ({ request }) => {
  const res = await request.get("/api/reports/operations/trips?format=csv&pageSize=1");
  expect([401, 403]).toContain(res.status());
});
