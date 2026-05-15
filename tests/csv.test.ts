import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, rowsToCsv } from "../src/lib/reports/csv.ts";

test("csvCell escapes commas and quotes", () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
});

test("rowsToCsv builds header and rows", () => {
  const csv = rowsToCsv(["id", "name"], [["1", "Test"]]);
  assert.match(csv, /^id,name/);
  assert.match(csv, /1,Test/);
});
