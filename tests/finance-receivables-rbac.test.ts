import test from "node:test";
import assert from "node:assert/strict";
import { accountsReceivableAmountFromFinancial } from "../src/lib/finance/accounts-receivable-amount.ts";
import { can } from "../src/lib/security/rbac.ts";
import type { SessionContext } from "../src/lib/domain/types.ts";

function session(role: SessionContext["role"]): SessionContext {
  return { userId: "u1", role };
}

test("financeiro can list receivables and resolve reconciliation", () => {
  assert.equal(can(session("financeiro"), "finance.read"), true);
  assert.equal(can(session("financeiro"), "finance.write"), true);
  assert.equal(can(session("financeiro"), "erp.mapping.write"), false);
});

test("operador can resolve via erp.mapping.write", () => {
  assert.equal(can(session("operador"), "erp.mapping.write"), true);
  assert.equal(can(session("operador"), "finance.read"), false);
});

test("accountsReceivableAmountFromFinancial accepts only positive finite amounts", () => {
  assert.equal(accountsReceivableAmountFromFinancial(200), 200);
  assert.equal(accountsReceivableAmountFromFinancial("150.75"), 150.75);
  assert.equal(accountsReceivableAmountFromFinancial(0), null);
  assert.equal(accountsReceivableAmountFromFinancial(-1), null);
  assert.equal(accountsReceivableAmountFromFinancial(Number.NaN), null);
  assert.equal(accountsReceivableAmountFromFinancial(Number.POSITIVE_INFINITY), null);
});
