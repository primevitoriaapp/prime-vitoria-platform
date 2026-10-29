import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOfx, parseStatementCsv, suggestMatches } from "../src/lib/finance/bank/statement-parse.ts";

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0756<BRANCHID>3008<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261028120000[-3:BRT]<TRNAMT>1250.00<FITID>A1<MEMO>PIX RECEBIDO COMEXPORT TRADING</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261029<TRNAMT>-350.50<FITID>A2<NAME>SEGURADORA X<MEMO>PAGAMENTO BOLETO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("lê OFX", () => {
  const r = parseOfx(OFX);
  assert.equal(r.lines.length, 2);
  assert.deepEqual(r.lines[0], { fit_id: "A1", posted_at: "2026-10-28", amount: 1250, description: "PIX RECEBIDO COMEXPORT TRADING" });
  assert.equal(r.lines[1].amount, -350.5);
  assert.equal(r.account.bank, "0756");
});

test("lê CSV com valor único e com crédito/débito", () => {
  const a = parseStatementCsv([["Data", "Histórico", "Valor"], ["28/10/2026", "PIX COMEXPORT", "1.250,00"], ["29/10/2026", "TARIFA", "-12,90"], ["29/10/2026", "SALDO DO DIA", "5.000,00"]]);
  assert.equal(a.length, 2);
  assert.equal(a[0].amount, 1250);
  assert.equal(a[1].amount, -12.9);
  const b = parseStatementCsv([["Extrato"], ["Data", "Descrição", "Crédito", "Débito"], ["28/10/2026", "TED", "300,00", ""], ["28/10/2026", "BOLETO", "", "80,00"]]);
  assert.deepEqual(b.map((x) => x.amount), [300, -80]);
});

test("sugere pelo valor, data e nome", () => {
  const line = { fit_id: "A1", posted_at: "2026-10-28", amount: 1250, description: "PIX RECEBIDO COMEXPORT TRADING" };
  const s = suggestMatches(line, [
    { kind: "fatura", id: "f1", amount: 1250, date: "2026-10-27", label: "COMEXPORT TRADING COMERCIO EXTERIOR LTDA" },
    { kind: "fatura", id: "f2", amount: 1250, date: "2026-09-01", label: "Outra Empresa" },
    { kind: "conta_pagar", id: "c1", amount: 1250, date: "2026-10-28", label: "Seguro" },
    { kind: "recebivel", id: "r1", amount: 900, date: "2026-10-28", label: "Comexport" }
  ]);
  assert.equal(s[0].candidate.id, "f1");
  assert.equal(s.length, 2);
  assert.ok(s[0].score > s[1].score);
});
