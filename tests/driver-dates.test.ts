import { test } from "node:test";
import assert from "node:assert/strict";
import { birthdayStatus, ageOn, docAlert, docAlertText } from "../src/lib/drivers/driver-dates.ts";

const now = new Date("2026-11-07T15:00:00Z"); // 12h em Vitória

test("aniversário: hoje, ontem, próximos dias", () => {
  assert.equal(birthdayStatus("1990-11-07", now), "today");
  assert.equal(birthdayStatus("1990-11-06", now), "yesterday");
  assert.equal(birthdayStatus("1990-11-10", now), 3);
  assert.equal(birthdayStatus("1990-12-25", now), null);
  assert.equal(ageOn("1990-11-07", now), 36);
  assert.equal(ageOn("1990-11-08", now), 35);
});

test("vencimento de documentos", () => {
  assert.equal(docAlert("CNH", "2027-01-01", now), null);
  assert.equal(docAlert("CNH", "2026-11-30", now)?.level, "atencao");
  assert.equal(docAlert("Seguro", "2026-11-10", now)?.level, "urgente");
  const v = docAlert("CNH", "2026-11-01", now)!;
  assert.equal(v.level, "vencido");
  assert.match(docAlertText(v), /VENCIDA há 6/);
});
