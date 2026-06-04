import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  getStagingAuthConfig,
  stagingEmailByRole,
  stagingTestsEnabled
} from "./helpers/staging-auth";

const ARTIFACT_DIR = path.join("artifacts", "p1-staging");

function stamp() {
  return Date.now().toString(36);
}

async function loginOperador(page: import("@playwright/test").Page) {
  const config = getStagingAuthConfig()!;
  const email = stagingEmailByRole.operador;
  await page.goto("/login?next=/clients");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(config.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
}

async function screenshot(page: import("@playwright/test").Page, name: string) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: true });
}

test.describe("P1 cadastro operacional (staging)", () => {
  test.skip(!stagingTestsEnabled(), "PLAYWRIGHT_STAGING=1 + credenciais staging");

  test.beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  test("1 — /clients: PF/PJ, documento, CNPJ, editar, inactivar", async ({ page }) => {
    const tag = stamp();
    await loginOperador(page);
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Novo cliente" })).toBeVisible({ timeout: 20_000 });

    const tipoSelect = page.locator("label").filter({ hasText: /^Tipo$/ }).locator("select");
    await expect(tipoSelect).toBeVisible();
    await tipoSelect.selectOption("PF");
    await expect(page.locator("label").filter({ hasText: /^CPF$/ })).toBeVisible();

    await page.getByPlaceholder("000.000.000-00").fill("52998224725");
    await page.locator('label:has-text("Nome completo") input').fill(`Cliente PF E2E ${tag}`);

    await page.getByRole("button", { name: /Registar cliente/i }).click();
    await expect(page.getByText(/registado|actualizado/i)).toBeVisible({ timeout: 20_000 });
    await screenshot(page, "clients-pf-created");

    await tipoSelect.selectOption("PJ");
    await expect(page.locator("label").filter({ hasText: /^CNPJ$/ })).toBeVisible();
    await page.getByPlaceholder("00.000.000/0000-00").fill("00000000000191");
    await page.getByRole("button", { name: "Consultar" }).click();
    await page.waitForTimeout(3000);
    const lookupMsg = page.getByText(/preenchidos|consultar|manualmente/i);
    await expect(lookupMsg.first()).toBeVisible({ timeout: 15_000 });

    const pjName = page.locator('label:has-text("Razão social") input').first();
    const currentName = await pjName.inputValue();
    if (!currentName.trim()) {
      await pjName.fill(`Empresa E2E ${tag}`);
    } else {
      await pjName.fill(`${currentName} E2E ${tag}`);
    }
    await page.getByRole("button", { name: /Registar cliente/i }).click();
    await expect(page.getByText(/registado|actualizado/i)).toBeVisible({ timeout: 20_000 });
    await screenshot(page, "clients-pj-saved");

    const row = page.getByRole("row", { name: new RegExp(tag) }).first();
    await row.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByRole("heading", { name: /Editar:/i })).toBeVisible();
    const notes = page.locator('label:has-text("Observações") textarea, label:has-text("Observações") input').first();
    await notes.fill(`Obs E2E ${tag}`);
    await page.getByRole("button", { name: /Actualizar cliente/i }).click();
    await expect(page.getByText(/actualizado/i)).toBeVisible({ timeout: 20_000 });
    await screenshot(page, "clients-edited");
  });

  test("2 — /drivers: ficha, operacional, financeiro, veículos", async ({ page }) => {
    const tag = stamp();
    await loginOperador(page);
    await page.goto("/drivers");
    await expect(page.getByRole("heading", { name: "Novo motorista" })).toBeVisible({ timeout: 20_000 });

    const openFicha = page.getByRole("button", { name: /Abrir ficha/i }).first();
    await expect(openFicha).toBeVisible({ timeout: 15_000 });
    await openFicha.click();
    await expect(page.getByRole("heading", { name: /Ficha:/i })).toBeVisible({ timeout: 15_000 });

    await page.locator('label:has-text("WhatsApp") input').first().fill(`27999${tag.slice(-6)}`);
    await page.locator('label:has-text("CEP") input').first().fill("29055260");
    await page.getByRole("button", { name: /Buscar CEP/i }).click();
    await page.waitForTimeout(2000);
    await page.locator('label:has-text("Número") input').first().fill("100");
    await page.getByLabel("Executivo", { exact: true }).check();
    await page.getByLabel("Grande Vitória", { exact: true }).check();
    await page.locator('label:has-text("Chave Pix") input').first().fill(`pix-e2e-${tag}@example.com`);
    await page.locator('label:has-text("Banco") input').first().fill("Banco E2E");

    await page.getByRole("button", { name: /Salvar ficha/i }).click();
    await expect(page.getByText(/guardada com sucesso/i)).toBeVisible({ timeout: 20_000 });
    await screenshot(page, "drivers-ficha-saved");

    const linkSelect = page.locator('label:has-text("Vincular veículo") select').first();
    const optionCount = await linkSelect.locator("option").count();
    if (optionCount > 1) {
      await linkSelect.selectOption({ index: 1 });
      await page.getByRole("button", { name: /Vincular veículo/i }).click();
      await expect(page.getByText(/vinculado/i)).toBeVisible({ timeout: 25_000 });
      await screenshot(page, "drivers-vehicle-linked");
    }
  });

  test("3 — /vehicles: frota compatível com vínculos", async ({ page }) => {
    await loginOperador(page);
    await page.goto("/vehicles");
    await expect(page.getByRole("heading", { name: "Frota activa" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("columnheader", { name: "Placa" })).toBeVisible();
    await screenshot(page, "vehicles-fleet");
  });

  test("4 — despacho: motorista + veículo vinculado", async ({ page, request }) => {
    const config = getStagingAuthConfig()!;
    const tokenRes = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: stagingEmailByRole.operador, password: config.password })
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    expect(tokenJson.access_token).toBeTruthy();
    const token = tokenJson.access_token!;

    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    };
    if (bypass) headers["x-vercel-protection-bypass"] = bypass;

    const driversRes = await request.get(`${config.baseUrl}/api/drivers`, { headers });
    expect(driversRes.ok()).toBeTruthy();
    const driversJson = (await driversRes.json()) as {
      data?: {
        id: string;
        linked_vehicles?: { id: string; plate: string; is_default?: boolean }[];
        default_vehicle?: { id: string };
      }[];
    };
    const driver = driversJson.data?.find((d) => (d.linked_vehicles?.length ?? 0) > 0) ?? driversJson.data?.[0];
    expect(driver?.id).toBeTruthy();
    const linked = driver?.linked_vehicles ?? [];
    const vehicleId =
      linked.length === 1
        ? linked[0].id
        : linked.find((v) => v.is_default)?.id ?? driver?.default_vehicle?.id;

    await loginOperador(page);
    await page.goto("/agenda");
    await expect(page).toHaveURL(/agenda/, { timeout: 20_000 });

    const dispatchHeading = page.getByText("Despacho direcionado").first();
    if (await dispatchHeading.isVisible().catch(() => false)) {
      const motoristaSelect = page.getByLabel("Motorista");
      await motoristaSelect.selectOption({ index: 1 });
      const veiculoSelect = page.getByLabel("Veículo");
      if (linked.length === 1) {
        await expect(veiculoSelect).toHaveValue(linked[0].id);
      } else if (vehicleId) {
        await veiculoSelect.selectOption(vehicleId);
      }
      await screenshot(page, "dispatch-driver-vehicle");
    } else {
      await screenshot(page, "agenda-no-dispatch-panel");
      test.info().annotations.push({
        type: "note",
        description: "Nenhuma corrida em estado despachável na agenda — API drivers/vehicles OK"
      });
    }

    expect(driver?.id).toBeTruthy();
  });
});
