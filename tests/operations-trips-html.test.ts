import test from "node:test";
import assert from "node:assert/strict";
import { formatReportKm, operationsTripsReportHtml } from "../src/lib/reports/operations-trips-html.ts";

test("operationsTripsReportHtml escapes and lists rows", () => {
  const html = operationsTripsReportHtml(
    [
      {
        id: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
        scheduled_at: "2026-05-15T10:00:00Z",
        operational_status: "completed",
        client_id: "c1",
        driver_id: null,
        origin_text: "A <script>",
        destination_text: "B",
        passenger_name: null,
        planned_km: 10,
        actual_km: 11,
        dispatch_mode: "manual"
      }
    ],
    new Date("2026-05-15T12:00:00Z")
  );
  assert.match(html, /<table>/);
  assert.match(html, /A &lt;script&gt;/);
  assert.match(html, /completed/);
  assert.match(html, /10.0/);
  assert.match(html, /11.0/);
});

test("formatReportKm hides non-finite km values", () => {
  assert.equal(formatReportKm(null), "");
  assert.equal(formatReportKm(12), "12.0");
  assert.equal(formatReportKm(12.34), "12.3");
  assert.equal(formatReportKm(Number.NaN), "");
  assert.equal(formatReportKm(Number.POSITIVE_INFINITY), "");
});
