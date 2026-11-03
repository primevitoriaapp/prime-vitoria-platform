import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCepVoucher } from "../src/lib/vouchers/cep-voucher.ts";

const words = JSON.parse(readFileSync(new URL("./fixtures/voucher-cep.json", import.meta.url), "utf8"));

test("lê o voucher da CEP", () => {
  const v = parseCepVoucher(words)!;
  assert.ok(v);
  assert.equal(v.number, "NR263701");
  assert.equal(v.issuerCnpj, "07.302.239/0001-65");
  assert.equal(v.items.length, 3);
  const [a, e, b] = v.items;
  assert.equal(a.letter, "A");
  assert.equal(a.date, "2026-11-05");
  assert.equal(a.time, "14:05");
  assert.equal(a.kind, "transfer");
  assert.match(a.origin, /^Aeroporto de Vitória Eurico de Aguiar Salles/);
  assert.match(a.destination, /^Easy Hotel Cachoeiro/);
  assert.equal(a.flight, "LA3844");
  assert.equal(a.amount, 750);
  assert.equal(a.vehicleType, "CARRO EXECUTIVO");
  assert.equal(a.passengers.length, 1);
  assert.ok(!a.passengers[0].name.startsWith("A "));
  assert.equal(a.passengers[0].phone, "+5527999990000");
  assert.equal(e.kind, "disponivel");
  assert.equal(e.hours, 5);
  assert.equal(e.amount, 700);
  assert.match(e.stopPlace ?? "", /^Cozinha Contemporânea Brasileira - Praça Portinari, 27 .* Brasil$/);
  assert.equal(b.date, "2026-11-06");
  assert.equal(b.time, "04:30");
  assert.equal(b.flight, "LA3787");
  assert.match(b.destination, /^Aeroporto de Vitória/);
});

import { addHours, voucherToLegs } from "../src/lib/vouchers/voucher-legs.ts";

test("voucher vira corridas, com o disponível dividido em 2 transfers", () => {
  const v = parseCepVoucher(words)!;
  const cats = [
    { id: "ess", name: "Prime Essencial", kind: "carro" },
    { id: "exe", name: "Prime Executivo", kind: "carro" },
    { id: "van", name: "Van Executiva", kind: "van" }
  ];
  const legs = voucherToLegs(v, cats);
  assert.equal(legs.length, 4);
  assert.deepEqual(legs.map((l) => l.ref), ["NR263701-A", "NR263701-E1", "NR263701-E2", "NR263701-B"]);
  assert.ok(legs.every((l) => l.categoryId === "exe"));
  assert.equal(legs[1].time, "18:50");
  assert.match(legs[1].destination, /^Cozinha Contemporânea/);
  assert.equal(legs[2].time, "23:50");
  assert.match(legs[2].destination, /^Easy Hotel/);
  assert.equal(legs[1].clientAmount, "700");
  assert.equal(legs[2].clientAmount, "0");
  assert.equal(legs[0].flight, "LA3844");
});

test("soma de horas vira o dia", () => {
  assert.deepEqual(addHours("2026-11-05", "21:00", 5), { date: "2026-11-06", time: "02:00" });
});

test("mesmo voucher lido do jeito do navegador (trechos com várias palavras)", () => {
  const w2 = JSON.parse(readFileSync(new URL("./fixtures/voucher-cep-pdfjs.json", import.meta.url), "utf8"));
  const v = parseCepVoucher(w2)!;
  assert.equal(v.items.length, 3);
  assert.equal(v.items[0].passengers[0].phone, "+5527999990000");
  assert.equal(v.items[0].flight, "LA3844");
  assert.match(v.items[1].stopPlace ?? "", /^Cozinha/);
  assert.match(v.items[2].destination, /^Aeroporto de Vitória/);
});
