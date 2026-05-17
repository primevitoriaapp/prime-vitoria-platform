import test from "node:test";
import assert from "node:assert/strict";
import { runBestEffort } from "../src/lib/server/best-effort.ts";

test("runBestEffort returns ok for successful task", async () => {
  assert.deepEqual(await runBestEffort("ok", async () => "done"), { ok: true });
});

test("runBestEffort captures rejected task", async () => {
  const original = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    assert.deepEqual(
      await runBestEffort("notify", async () => {
        throw new Error("boom");
      }),
      { ok: false, message: "boom" }
    );
    assert.equal(logs.length, 1);
    assert.equal(logs[0][1], "notify");
  } finally {
    console.error = original;
  }
});
