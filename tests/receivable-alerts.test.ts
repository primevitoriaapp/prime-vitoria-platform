import test from "node:test";
import assert from "node:assert/strict";
import { classifyReceivables } from "../src/lib/finance/receivable-alerts.ts";

test("separa vencidas e que vencem em até 3 dias", () => {
  const rows = [
    { id: "a", client_name: "Comexport", amount: 248, due_date: "2026-10-20" },
    { id: "b", client_name: "CEP", amount: 100, due_date: "2026-10-28" },
    { id: "c", client_name: "Cox", amount: 50.5, due_date: "2026-10-31" },
    { id: "d", client_name: "Cox", amount: 70, due_date: "2026-11-05" }
  ];
  const r = classifyReceivables(rows, "2026-10-28");
  assert.equal(r.overdue.count, 1);
  assert.equal(r.overdue.total, 248);
  assert.equal(r.due_soon.count, 2);
  assert.equal(r.due_soon.total, 150.5);
});
