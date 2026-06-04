import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatBrDate,
  formatBrDateTime,
  maskBrDateInput,
  normalizeDateFieldForStorage,
  parseBrDateTimeToIso,
  parseBrDateToIso
} from "../src/lib/dates/br-date.ts";

test("parseBrDateToIso aceita DD/MM/AAAA", () => {
  assert.equal(parseBrDateToIso("29/05/1990"), "1990-05-29");
});

test("parseBrDateToIso aceita YYYY-MM-DD", () => {
  assert.equal(parseBrDateToIso("1990-05-29"), "1990-05-29");
});

test("parseBrDateToIso rejeita data inválida", () => {
  assert.equal(parseBrDateToIso("31/02/2020"), null);
});

test("formatBrDate exibe DD/MM/AAAA", () => {
  assert.equal(formatBrDate("1990-05-29"), "29/05/1990");
});

test("parseBrDateTimeToIso converte para ISO", () => {
  const iso = parseBrDateTimeToIso("29/05/2026 14:30");
  assert.ok(iso);
  assert.match(iso!, /2026-05-29/);
});

test("maskBrDateInput formata enquanto digita", () => {
  assert.equal(maskBrDateInput("29051990"), "29/05/1990");
});

test("normalizeDateFieldForStorage unifica formatos", () => {
  assert.equal(normalizeDateFieldForStorage("15/08/1985"), "1985-08-15");
  assert.equal(normalizeDateFieldForStorage("1985-08-15"), "1985-08-15");
});

test("formatBrDateTime exibe data e hora brasileiras", () => {
  const label = formatBrDateTime("2026-05-29T14:30:00.000Z");
  assert.match(label, /^29\/05\/2026 \d{2}:\d{2}$/);
});
