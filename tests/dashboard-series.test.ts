import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSeries } from "../src/lib/operations/dashboard-metrics.ts";

const now = new Date("2026-11-03T15:00:00Z");
const t = (iso: string, status: string, c: number, d: number) => ({ scheduled_at: iso, operational_status: status, client_amount: c, driver_amount: d, client_id: "c", driver_id: "d" });

test("mês por dia", () => {
  const s = buildSeries([t("2026-11-02T13:00:00Z", "completed", 300, 200), t("2026-11-02T23:30:00Z", "completed", 100, 50), t("2026-11-03T02:30:00Z", "cancelled", 999, 0)], "mes", now);
  assert.equal(s.length, 30);
  assert.equal(s[1].label, "02/11");
  assert.equal(s[1].revenue, 400);
  assert.equal(s[1].profit, 150);
  assert.equal(s[1].trips, 2);
  assert.equal(s[2].trips, 0);
});

test("hoje mostra 14 dias e ano mostra 12 meses", () => {
  assert.equal(buildSeries([], "hoje", now).length, 14);
  assert.equal(buildSeries([], "hoje", now)[13].key, "2026-11-03");
  const y = buildSeries([t("2026-03-10T12:00:00Z", "completed", 100, 40)], "ano", now);
  assert.equal(y.length, 12);
  assert.equal(y[2].revenue, 100);
});
