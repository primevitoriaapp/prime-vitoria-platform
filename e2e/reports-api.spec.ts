import { test, expect } from "@playwright/test";
import { unauthenticatedApiStatuses } from "./helpers/ci-expectations";

test("operations report requires authentication", async ({ request }) => {
  const res = await request.get("/api/reports/operations/trips?pageSize=1");
  expect(unauthenticatedApiStatuses).toContain(res.status());
});

test("operations report CSV requires authentication", async ({ request }) => {
  const res = await request.get("/api/reports/operations/trips?format=csv&pageSize=1");
  expect(unauthenticatedApiStatuses).toContain(res.status());
});
