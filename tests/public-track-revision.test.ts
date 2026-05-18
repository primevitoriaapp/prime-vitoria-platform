import test from "node:test";
import assert from "node:assert/strict";
import { isPublicTrackTerminalStatus, publicTrackRevision } from "../src/lib/public/track-revision.ts";

test("publicTrackRevision changes when location timestamp changes", () => {
  const base = publicTrackRevision({
    operational_status: "on_the_way",
    location: { recorded_at: "2026-01-01T10:00:00Z" },
    planned_km: 12,
    actual_km: null,
    km_updated_at: null
  });

  const next = publicTrackRevision({
    operational_status: "on_the_way",
    location: { recorded_at: "2026-01-01T10:00:05Z" },
    planned_km: 12,
    actual_km: null,
    km_updated_at: null
  });

  assert.notEqual(next, base);
});

test("publicTrackRevision changes when status or KM changes", () => {
  const base = publicTrackRevision({
    operational_status: "in_progress",
    location: null,
    planned_km: 10,
    actual_km: null,
    km_updated_at: null
  });

  assert.notEqual(
    publicTrackRevision({
      operational_status: "completed",
      location: null,
      planned_km: 10,
      actual_km: null,
      km_updated_at: null
    }),
    base
  );
  assert.notEqual(
    publicTrackRevision({
      operational_status: "in_progress",
      location: null,
      planned_km: 10,
      actual_km: 11.2,
      km_updated_at: "2026-01-01T11:00:00Z"
    }),
    base
  );
});

test("isPublicTrackTerminalStatus identifies terminal passenger tracking states", () => {
  assert.equal(isPublicTrackTerminalStatus("completed"), true);
  assert.equal(isPublicTrackTerminalStatus("cancelled"), true);
  assert.equal(isPublicTrackTerminalStatus("rejected"), true);
  assert.equal(isPublicTrackTerminalStatus("no_show"), true);
  assert.equal(isPublicTrackTerminalStatus("on_the_way"), false);
  assert.equal(isPublicTrackTerminalStatus("in_progress"), false);
});
