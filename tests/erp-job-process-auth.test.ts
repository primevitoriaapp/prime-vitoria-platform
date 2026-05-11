import test from "node:test";
import assert from "node:assert/strict";
import { isErpJobProcessMachineRequest } from "../src/lib/security/erp-job-process-auth.ts";

test("machine request false when secret unset", () => {
  const prev = process.env.ERP_JOB_PROCESS_SECRET;
  delete process.env.ERP_JOB_PROCESS_SECRET;
  try {
    const req = new Request("https://example.com", {
      headers: { authorization: "Bearer anything" }
    });
    assert.equal(isErpJobProcessMachineRequest(req), false);
  } finally {
    if (prev !== undefined) process.env.ERP_JOB_PROCESS_SECRET = prev;
  }
});

test("machine request true when bearer matches secret", () => {
  const prev = process.env.ERP_JOB_PROCESS_SECRET;
  process.env.ERP_JOB_PROCESS_SECRET = "cron-test-secret-xyz";
  try {
    const req = new Request("https://example.com", {
      headers: { authorization: "Bearer cron-test-secret-xyz" }
    });
    assert.equal(isErpJobProcessMachineRequest(req), true);
  } finally {
    if (prev !== undefined) process.env.ERP_JOB_PROCESS_SECRET = prev;
    else delete process.env.ERP_JOB_PROCESS_SECRET;
  }
});

test("machine request false when bearer wrong length or value", () => {
  const prev = process.env.ERP_JOB_PROCESS_SECRET;
  process.env.ERP_JOB_PROCESS_SECRET = "aaa";
  try {
    const bad = new Request("https://example.com", {
      headers: { authorization: "Bearer aab" }
    });
    assert.equal(isErpJobProcessMachineRequest(bad), false);
    const missing = new Request("https://example.com");
    assert.equal(isErpJobProcessMachineRequest(missing), false);
  } finally {
    if (prev !== undefined) process.env.ERP_JOB_PROCESS_SECRET = prev;
    else delete process.env.ERP_JOB_PROCESS_SECRET;
  }
});
