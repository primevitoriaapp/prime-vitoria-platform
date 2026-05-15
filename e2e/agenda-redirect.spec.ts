import { test, expect } from "@playwright/test";

test("agenda redirects guest to login", async ({ page }) => {
  const res = await page.goto("/agenda");
  expect(res?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/login/);
});
