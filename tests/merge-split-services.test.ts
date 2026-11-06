import { test } from "node:test";
import assert from "node:assert/strict";
import { groupSplitItems, isSplitGroup, splitBaseRef } from "../src/lib/finance/merge-split-services.ts";

test("base do NR dividido", () => {
  assert.equal(splitBaseRef("NR263701-E1"), "NR263701-E");
  assert.equal(splitBaseRef("NR263701-A"), null);
});

test("junta E1 e E2, deixa A e B soltos", () => {
  const items = ["NR1-A", "NR1-E1", "NR1-E2", "NR1-B"].map((ref) => ({ ref }));
  const g = groupSplitItems(items, (i) => i.ref);
  assert.equal(g.length, 3);
  const e = g[1];
  assert.ok(isSplitGroup(e));
  if (isSplitGroup(e)) assert.equal(e.parts.length, 2);
});

test("um trecho só (C1 sozinho) não agrupa", () => {
  const g = groupSplitItems([{ ref: "NR1-C1" }], (i) => i.ref);
  assert.equal(isSplitGroup(g[0]), false);
});
