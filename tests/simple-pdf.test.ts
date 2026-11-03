import { test } from "node:test";
import assert from "node:assert/strict";
import { SimplePdf, wrap, textWidth } from "../src/lib/pdf/simple-pdf.ts";

test("wrap respeita a largura", () => {
  const lines = wrap("Comfort Suites Vitória, Av. Saturnino de Brito, 1327 - Praia do Canto", "R", 9, 120);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(textWidth(l, "R", 9) <= 120);
});

test("gera um PDF válido com várias páginas", () => {
  const pdf = new SimplePdf();
  pdf.text("Orçamento nº 3 — ação", 40, 40, { font: "B" });
  pdf.addPage();
  pdf.text("Página 2", 40, 40);
  const bytes = pdf.toBytes();
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 8));
  assert.equal(head, "%PDF-1.4");
  const all = new TextDecoder("latin1").decode(bytes);
  assert.match(all, /\/Count 2/);
  assert.match(all, /%%EOF\s*$/);
});
