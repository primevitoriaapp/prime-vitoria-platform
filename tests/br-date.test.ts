import assert from "node:assert/strict";
import { test } from "node:test";
import {
  brDateToEndOfDayIso,
  brDateToStartOfDayIso,
  defaultScheduledAtIso,
  formatBrDate,
  formatBrDateTime,
  formatBrTime,
  maskBrDateInput,
  normalizeDateFieldForStorage,
  normalizeScheduledAtForStorage,
  parseBrDateTimeToIso,
  parseBrDateToIso,
  resolveScheduledAtForSubmit,
  scheduledAtSortMs,
  scheduledAtToUtcIso,
  validatePortalScheduledAt
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

test("parseBrDateTimeToIso interpreta horário como Brasília (UTC-3)", () => {
  const iso = parseBrDateTimeToIso("29/05/2026 22:00");
  assert.equal(iso, "2026-05-30T01:00:00.000Z");
});

test("formatBrDateTime exibe em America/Sao_Paulo", () => {
  assert.equal(formatBrDateTime("2026-05-30T01:00:00.000Z"), "29/05/2026 22:00");
});

test("formatBrTime exibe hora em America/Sao_Paulo", () => {
  assert.equal(formatBrTime("2026-05-30T01:00:00.000Z"), "22:00");
});

test("normalizeScheduledAtForStorage trata ISO sem offset como Brasília", () => {
  assert.equal(normalizeScheduledAtForStorage("2026-05-29T22:00:00"), "2026-05-30T01:00:00.000Z");
});

test("brDateToStartOfDayIso usa início do dia em Brasília", () => {
  assert.equal(brDateToStartOfDayIso("29/05/2026"), "2026-05-29T03:00:00.000Z");
});

test("brDateToEndOfDayIso usa fim do dia em Brasília", () => {
  assert.equal(brDateToEndOfDayIso("29/05/2026"), "2026-05-30T02:59:59.999Z");
});

test("maskBrDateInput formata enquanto digita", () => {
  assert.equal(maskBrDateInput("29051990"), "29/05/1990");
});

test("normalizeDateFieldForStorage unifica formatos", () => {
  assert.equal(normalizeDateFieldForStorage("15/08/1985"), "1985-08-15");
  assert.equal(normalizeDateFieldForStorage("1985-08-15"), "1985-08-15");
});

test("normalizeScheduledAtForStorage aceita YYYY-MM-DD HH:mm como Brasília", () => {
  assert.equal(normalizeScheduledAtForStorage("2026-05-29 22:00"), "2026-05-30T01:00:00.000Z");
});

test("resolveScheduledAtForSubmit preserva ano digitado no portal", () => {
  const iso = resolveScheduledAtForSubmit("29/05/2026 10:00");
  assert.equal(iso, "2026-05-29T13:00:00.000Z");
});

test("defaultScheduledAtIso usa calendário de Brasília", () => {
  const iso = defaultScheduledAtIso(24);
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.match(formatBrDateTime(iso), /^\d{2}\/\d{2}\/\d{4} \d{2}:00$/);
});

test("scheduledAtToUtcIso trata ISO sem offset como Brasília", () => {
  assert.equal(scheduledAtToUtcIso("2026-05-29T22:00:00"), "2026-05-30T01:00:00.000Z");
});

test("scheduledAtSortMs ordena 2026 à frente de 2025", () => {
  assert.ok(
    scheduledAtSortMs("2026-05-30T01:00:00.000Z") > scheduledAtSortMs("2025-05-30T01:00:00.000Z")
  );
});

test("validatePortalScheduledAt rejeita ano no passado", () => {
  const currentYear = new Date().getFullYear();
  const past = validatePortalScheduledAt("29/05/2020 10:00");
  assert.equal(past.ok, false);
  if (!past.ok) {
    assert.match(past.message, new RegExp(String(currentYear)));
  }
  const ok = validatePortalScheduledAt(`29/05/${currentYear} 10:00`);
  assert.equal(ok.ok, true);
});
