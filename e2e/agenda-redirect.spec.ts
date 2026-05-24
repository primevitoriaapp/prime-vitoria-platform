import { test, expect } from "@playwright/test";

test("agenda redirects guest to login", async ({ page }) => {
  test.skip(
    process.env.TRUST_HEADER_AUTH === "true",
    "CI usa TRUST_HEADER_AUTH; convidado acede à agenda sem redirect"
  );
  const res = await page.goto("/agenda");
  expect(res?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/login/);
});
