import { test, expect } from "@playwright/test";
import {
  getStagingAuthConfig,
  signInStaging,
  stagingEmailByRole,
  stagingTestsEnabled
} from "./helpers/staging-auth";

test.describe("Staging authenticated flows", () => {
  test.skip(!stagingTestsEnabled(), "Set PLAYWRIGHT_STAGING=1 and staging Supabase env vars");

  test("login form reaches dashboard for operador", async ({ page }) => {
    const config = getStagingAuthConfig()!;
    const role = process.env.STAGING_E2E_ROLE ?? "operador";
    const email = process.env.STAGING_E2E_EMAIL ?? stagingEmailByRole[role] ?? stagingEmailByRole.operador;

    await page.goto("/login?next=/agenda");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Senha").fill(config.password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    await expect(page).toHaveURL(/agenda/);
  });

  test("financeiro can load finance page with webhook inbox", async ({ page }) => {
    const config = getStagingAuthConfig()!;
    const email = process.env.STAGING_E2E_EMAIL ?? stagingEmailByRole.financeiro;

    await page.goto("/login?next=/finance");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Senha").fill(config.password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/finance/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Financeiro" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Webhooks ERP (entrada)" })).toBeVisible();
  });

  test("admin API report JSON and CSV via bearer token", async ({ request }) => {
    const config = getStagingAuthConfig()!;
    const token = await signInStaging({ ...config, role: "admin", email: stagingEmailByRole.admin });

    const jsonRes = await request.get(`${config.baseUrl}/api/reports/operations/trips?pageSize=5`, {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" }
    });
    expect(jsonRes.ok()).toBeTruthy();
    const json = (await jsonRes.json()) as { success?: boolean; data?: { items?: unknown[] } };
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data?.items)).toBe(true);

    const csvRes = await request.get(
      `${config.baseUrl}/api/reports/operations/trips?format=csv&pageSize=5`,
      { headers: { Authorization: `Bearer ${token}`, accept: "text/csv" } }
    );
    expect(csvRes.ok()).toBeTruthy();
    const csv = await csvRes.text();
    expect(csv.startsWith("id,")).toBe(true);
  });
});
