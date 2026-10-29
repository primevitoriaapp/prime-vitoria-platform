import { test } from "node:test";
import assert from "node:assert/strict";
import { groupPayouts, payoutStatementText, type PayoutOwner, type PayoutRow } from "../src/lib/finance/partner-payouts.ts";

const row = (o: Partial<PayoutRow>): PayoutRow => ({
  id: "x",
  amount: 100,
  status: "open",
  paid_at: null,
  due_date: null,
  released: true,
  trip_id: "t",
  trip_at: "2026-10-20T15:00:00Z",
  route: "Aeroporto → Hotel",
  client_name: "Cox",
  driver_id: "d1",
  driver_name: "João",
  partner_id: null,
  ...o
});

test("agrupa por empresa parceira e separa motorista avulso", () => {
  const partners = new Map<string, PayoutOwner>([["p1", { id: "p1", kind: "PJ", name: "Frota ES Ltda", document: "1", pix_key: "pix@frota", phone: null }]]);
  const drivers = new Map<string, PayoutOwner>([["d3", { id: "d3", kind: "avulso", name: "Carlos", document: null, pix_key: null, phone: null }]]);
  const g = groupPayouts(
    [
      row({ id: "a", driver_id: "d1", partner_id: "p1", amount: 200 }),
      row({ id: "b", driver_id: "d2", driver_name: "Ana", partner_id: "p1", amount: 150, released: false }),
      row({ id: "c", driver_id: "d3", driver_name: "Carlos", amount: 80 }),
      row({ id: "d", driver_id: "d3", driver_name: "Carlos", amount: 50, status: "paid" }),
      row({ id: "e", driver_id: "d3", status: "cancelled" })
    ],
    partners,
    drivers
  );
  assert.equal(g.length, 2);
  assert.equal(g[0].name, "Frota ES Ltda");
  assert.equal(g[0].released, 200);
  assert.equal(g[0].waiting, 150);
  assert.deepEqual(g[0].drivers, ["João", "Ana"]);
  assert.equal(g[1].paid, 50);
  assert.equal(g[1].openCount, 1);
  const txt = payoutStatementText(g[0]);
  assert.match(txt, /Total: R\$\s?350,00/);
  assert.match(txt, /PIX: pix@frota/);
});
