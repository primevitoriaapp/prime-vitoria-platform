import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProgress } from "../src/lib/trips/trip-progress.ts";

test("andamento normal", () => {
  const p = buildProgress("dispatched", "2026-11-01T10:00:00Z", [
    { to_status: "approved", changed_at: "2026-11-01T10:05:00Z" },
    { to_status: "dispatched", changed_at: "2026-11-01T11:00:00Z" }
  ]);
  assert.deepEqual(p.steps.map((s) => s.state), ["done", "done", "current", "todo", "todo", "todo", "todo"]);
  assert.equal(p.steps[0].at, "2026-11-01T10:00:00Z");
  assert.equal(p.steps[2].at, "2026-11-01T11:00:00Z");
  assert.equal(p.steps[3].at, null);
});

test("finalizada fica toda verde", () => {
  const p = buildProgress("completed", "2026-11-01T10:00:00Z", [{ to_status: "completed", changed_at: "2026-11-01T12:00:00Z" }]);
  assert.ok(p.steps.every((s) => s.state === "done"));
});

test("cancelada para no último passo", () => {
  const p = buildProgress("cancelled", "2026-11-01T10:00:00Z", [
    { to_status: "approved", changed_at: "2026-11-01T10:05:00Z" },
    { to_status: "cancelled", changed_at: "2026-11-01T10:30:00Z" }
  ]);
  assert.equal(p.cancelled?.at, "2026-11-01T10:30:00Z");
  assert.deepEqual(p.steps.map((s) => s.state).slice(0, 3), ["done", "done", "todo"]);
});

test("horário corrigido pela central, KM e paradas", () => {
  const p = buildProgress(
    "completed",
    "2026-11-01T10:00:00Z",
    [
      { to_status: "on_the_way", changed_at: "2026-11-01T11:00:00Z" },
      { to_status: "completed", changed_at: "2026-11-01T12:00:00Z" }
    ],
    { overrides: { caminho: "2026-11-01T10:50:00Z" }, km: 34, stops: [{ label: "Carla desembarcou", at: "2026-11-01T11:40:00Z" }] }
  );
  const caminho = p.steps.find((s) => s.key === "caminho");
  assert.equal(caminho?.at, "2026-11-01T10:50:00Z");
  assert.equal(caminho?.edited, true);
  assert.equal(p.steps.at(-1)?.detail, "KM rodado: 34 km");
  assert.equal(p.steps.at(-2)?.label, "Carla desembarcou");
});
