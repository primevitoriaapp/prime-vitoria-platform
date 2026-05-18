import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, neutralizeCsvFormula, rowsToCsv } from "../src/lib/reports/csv.ts";

test("csvCell escapes commas and quotes", () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
});

test("csvCell neutralizes spreadsheet formulas in text cells", () => {
  assert.equal(csvCell("=IMPORTXML(\"https://example.com\")"), `"\'=IMPORTXML(""https://example.com"")"`);
  assert.equal(csvCell("+SUM(A1:A2)"), "'+SUM(A1:A2)");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell(-10), "-10");
});

test("neutralizeCsvFormula only changes formula-like prefixes", () => {
  assert.equal(neutralizeCsvFormula("Rua A"), "Rua A");
  assert.equal(neutralizeCsvFormula("-danger"), "'-danger");
});

test("rowsToCsv builds header and rows", () => {
  const csv = rowsToCsv(["id", "name"], [["1", "Test"]]);
  assert.match(csv, /^id,name/);
  assert.match(csv, /1,Test/);
});
