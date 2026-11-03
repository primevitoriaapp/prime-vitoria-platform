import { test } from "node:test";
import assert from "node:assert/strict";
import { boletoTextFields, dueFromFactor, findBoletoLine, parseBoletoLine, suggestCategory, validLine } from "../src/lib/finance/boleto.ts";

// Monta uma linha bancária válida (calcula os DVs dos campos).
function mod10(num: string) {
  let s = 0, w = 2;
  for (let i = num.length - 1; i >= 0; i--) { let p = Number(num[i]) * w; if (p > 9) p = Math.floor(p / 10) + (p % 10); s += p; w = w === 2 ? 1 : 2; }
  return (10 - (s % 10)) % 10;
}
function line(bank: string, factor: string, value: string) {
  const f1 = `${bank}9` + "12345";
  const f2 = "6789012345";
  const f3 = "6789012345";
  return `${f1}${mod10(f1)}${f2}${mod10(f2)}${f3}${mod10(f3)}1${factor}${value}`;
}

test("fator de vencimento (regra nova de 2025)", () => {
  assert.equal(dueFromFactor(1000, new Date("2025-03-01")), "2025-02-22");
  assert.equal(dueFromFactor(9999, new Date("2025-01-01")), "2025-02-21");
  assert.equal(dueFromFactor(1620, new Date("2026-11-03")), "2026-11-04");
});

test("linha bancária: banco, valor e vencimento", () => {
  const l = line("021", "1620", "0000084000");
  assert.equal(l.length, 47);
  assert.ok(validLine(l));
  const b = parseBoletoLine(l, new Date("2026-11-03"))!;
  assert.equal(b.bank, "Banestes");
  assert.equal(b.amount, 840);
  assert.equal(b.dueDate, "2026-11-04");
});

test("acha a linha no texto e lê os campos", () => {
  const l = line("341", "1630", "0000123456");
  const pretty = `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}`;
  const text = `Recibo do pagador\nBeneficiário: CONTABILIDADE SILVA LTDA CNPJ 12.345.678/0001-90\nVencimento 14/11/2026\nValor do documento R$ 1.234,56\n${pretty}`;
  assert.equal(findBoletoLine(text), l);
  const f = boletoTextFields(text);
  assert.equal(f.beneficiary, "CONTABILIDADE SILVA LTDA");
  assert.equal(f.cnpj, "12.345.678/0001-90");
  assert.equal(f.dueDate, "2026-11-14");
  assert.equal(f.amount, 1234.56);
  assert.equal(suggestCategory(f.beneficiary, null), "contabilidade");
  assert.equal(suggestCategory("Qualquer", null, "seguro"), "seguro");
});

test("arrecadação (conta de consumo)", () => {
  // código de barras 44: 8 4 6 x valor(11) ...
  const bar = "846" + "0" + "00000012345" + "0".repeat(29);
  const blocks = [0, 1, 2, 3].map((b) => { const s = bar.slice(b * 11, b * 11 + 11); return s + mod10(s); }).join("");
  const b = parseBoletoLine(blocks)!;
  assert.equal(b.kind, "arrecadacao");
  assert.equal(b.amount, 123.45);
  assert.equal(b.segment, "4");
  assert.equal(suggestCategory(null, b.segment), "telefone_internet");
});
