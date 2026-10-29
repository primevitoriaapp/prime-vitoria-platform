import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDriverEarnings } from "../src/lib/drivers/driver-earnings.ts";

test("resumo de ganhos do parceiro", () => {
  const now = new Date("2026-10-10T15:00:00Z");
  const s = summarizeDriverEarnings(
    [
      { scheduled_at: "2026-10-10T12:00:00Z", driver_amount: 100, operational_status: "completed" },
      { scheduled_at: "2026-10-03T12:00:00Z", driver_amount: "150.5", operational_status: "completed" },
      { scheduled_at: "2026-09-30T12:00:00Z", driver_amount: 80, operational_status: "completed" },
      { scheduled_at: "2026-10-11T12:00:00Z", driver_amount: 120, operational_status: "dispatched" },
      { scheduled_at: "2026-10-12T12:00:00Z", driver_amount: 90, operational_status: "cancelled" }
    ],
    [
      { amount: 80, status: "paid", receivable_status: "paid" },
      { amount: 150.5, status: "open", receivable_status: "paid" },
      { amount: 100, status: "open", receivable_status: "open" }
    ],
    now
  );
  assert.deepEqual(s, { hoje: 100, mes: 250.5, corridas_mes: 2, previsto: 120, a_receber: 250.5, liberado: 150.5, aguardando_cliente: 100, pago: 80 });
});
