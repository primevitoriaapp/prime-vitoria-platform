import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationsHistoryCsv, csvEscape } from "../src/lib/operations/history-csv.ts";

test("csvEscape quotes when needed", () => {
  assert.equal(csvEscape("ok"), "ok");
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape("a\nb"), '"a\nb"');
  assert.equal(csvEscape("=cmd"), "'=cmd");
});

test("buildOperationsHistoryCsv builds header and row", () => {
  const csv = buildOperationsHistoryCsv([
    {
      id: "t1",
      scheduled_at: "2026-01-01T10:00:00Z",
      operational_status: "completed",
      client_id: "c1",
      driver_id: "d1",
      driver_name: "João",
      passenger_name: null,
      origin_text: "=A",
      destination_text: "B",
      planned_km: 10,
      actual_km: 11,
      updated_at: "2026-01-02T00:00:00Z"
    }
  ]);
  assert.ok(csv.startsWith("id,scheduled_at,"));
  assert.match(csv, /completed/);
  assert.match(csv, /João/);
  assert.match(csv, /'=A/);
});
