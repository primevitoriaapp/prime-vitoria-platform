import { test } from "node:test";
import assert from "node:assert/strict";
import { rankOf, punctuality } from "../src/lib/drivers/driver-ranking.ts";

test("ranking: posição por corridas, empate pela pontualidade, sem corridas fica fora", () => {
  const s = [
    { driver_id: "a", trips: 10, on_time: 9, with_arrival: 10 },
    { driver_id: "b", trips: 12, on_time: 6, with_arrival: 12 },
    { driver_id: "c", trips: 10, on_time: 10, with_arrival: 10 },
    { driver_id: "d", trips: 0, on_time: 0, with_arrival: 0 }
  ];
  assert.deepEqual(rankOf(s, "b"), { position: 1, of: 3 });
  assert.deepEqual(rankOf(s, "c"), { position: 2, of: 3 });
  assert.deepEqual(rankOf(s, "a"), { position: 3, of: 3 });
  assert.deepEqual(rankOf(s, "d"), { position: null, of: 3 });
  assert.equal(punctuality(s[0]), 90);
});
