import test from "node:test";
import assert from "node:assert/strict";
import { saoPauloDateAndTimeToUtcIso, saoPauloTodayYmd } from "../src/lib/dates/br-date.ts";

test("saoPauloDateAndTimeToUtcIso converte horário de Brasília", () => {
  assert.equal(saoPauloDateAndTimeToUtcIso("2026-10-29", "16:00"), "2026-10-29T19:00:00.000Z");
  assert.equal(saoPauloDateAndTimeToUtcIso("2026-10-29", "25:00"), null);
  assert.equal(saoPauloDateAndTimeToUtcIso("", "10:00"), null);
});

test("saoPauloTodayYmd usa o dia de Brasília", () => {
  assert.equal(saoPauloTodayYmd(new Date("2026-10-29T02:00:00Z")), "2026-10-28");
});
