import { test } from "node:test";
import assert from "node:assert/strict";
import { savedAmount, benefitHeadline, partnerIsLive, benefitIsValid, newClubCode } from "../src/lib/club/club.ts";

test("economia por tipo de benefício", () => {
  assert.equal(savedAmount("percentual", 15, { purchase: 200 }), 30);
  assert.equal(savedAmount("valor", 50, { purchase: 30 }), 30);
  assert.equal(savedAmount("valor", 50, {}), 50);
  assert.equal(savedAmount("por_litro", 0.2, { liters: 40 }), 8);
  assert.equal(savedAmount("preco_exclusivo", 35, { saved: 15 }), 15);
  assert.equal(savedAmount("percentual", 10, {}), 0);
});

test("título curto do benefício", () => {
  assert.equal(benefitHeadline({ kind: "percentual", value: 15 }), "15% de desconto");
  assert.equal(benefitHeadline({ kind: "gratuito", value: null }), "Grátis");
});

test("publicação programada e vigência", () => {
  const now = new Date("2026-12-01T12:00:00Z");
  assert.equal(partnerIsLive({ status: "publicado", publish_at: null }, now), true);
  assert.equal(partnerIsLive({ status: "publicado", publish_at: "2026-12-05T00:00:00Z" }, now), false);
  assert.equal(partnerIsLive({ status: "rascunho", publish_at: null }, now), false);
  assert.equal(benefitIsValid({ active: true, valid_from: "2026-11-01", valid_until: "2026-11-30" }, "2026-12-01"), false);
  assert.equal(benefitIsValid({ active: true, valid_from: null, valid_until: null }, "2026-12-01"), true);
});

test("código do QR sem letras confusas", () => {
  const c = newClubCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
  assert.equal(c.length, 10);
  assert.doesNotMatch(c, /[01OIL]/);
});
