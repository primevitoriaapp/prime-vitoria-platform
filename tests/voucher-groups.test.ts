import { test } from "node:test";
import assert from "node:assert/strict";
import { groupVouchers } from "../src/lib/finance/voucher-groups.ts";

const t = (id: string, ref: string, at: string, st: string, amt: number) => ({
  id, client_id: "cep", client_name: "CEP", ref, scheduled_at: at, operational_status: st, client_amount: amt, has_voucher: false
});

test("junta B, C1 e C2 do mesmo NR numa fatura só; com item pendente não fica pronto", () => {
  const g = groupVouchers([
    t("1", "NR263261-B", "2026-11-04T11:05:00Z", "completed", 200),
    t("2", "NR263261-C1", "2026-11-04T14:00:00Z", "completed", 350),
    t("3", "NR263261-C2", "2026-11-04T18:30:00Z", "completed", 350),
    t("4", "NR263701-A", "2026-11-05T17:05:00Z", "on_the_way", 750),
    t("5", "NR263701-B", "2026-11-06T07:30:00Z", "dispatched", 750),
    t("6", "NR263701-X", "2026-11-06T07:30:00Z", "cancelled", 999)
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].ref, "NR263261");
  assert.equal(g[0].trips.length, 3);
  assert.equal(g[0].total, 900);
  assert.equal(g[0].ready, true);
  assert.equal(g[1].ready, false);
  assert.equal(g[1].pending, 2);
  assert.equal(g[1].total, 1500);
});
