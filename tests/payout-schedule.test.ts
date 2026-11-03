import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addBusinessDays,
  bankHolidays,
  clientDueDate,
  driverPayoutDate,
  driverPayoutDateFromClientDue,
  easterSunday,
  invoiceClosingDate,
  isBusinessDay,
  nextBusinessDay
} from "../src/lib/finance/payout-schedule.ts";

test("Páscoa e feriados bancários", () => {
  assert.equal(easterSunday(2026), "2026-04-05");
  assert.equal(easterSunday(2027), "2027-03-28");
  const h = bankHolidays(2026);
  assert.ok(h.has("2026-02-16") && h.has("2026-02-17")); // Carnaval
  assert.ok(h.has("2026-04-03")); // Sexta-feira Santa
  assert.ok(h.has("2026-06-04")); // Corpus Christi
  assert.ok(h.has("2026-11-20")); // Consciência Negra
  assert.equal(isBusinessDay("2026-11-20"), false);
  assert.equal(isBusinessDay("2026-11-07"), false); // sábado
  assert.equal(isBusinessDay("2026-11-09"), true);
});

test("dias úteis", () => {
  assert.equal(nextBusinessDay("2026-11-07"), "2026-11-09");
  assert.equal(addBusinessDays("2026-11-19", 2), "2026-11-24"); // pula 20 (feriado), 21-22 (fim de semana)
});

test("fechamento da fatura", () => {
  assert.equal(invoiceClosingDate("2026-11-03", 0), "2026-11-30");
  assert.equal(invoiceClosingDate("2026-02-10", 0), "2026-02-28");
  assert.equal(invoiceClosingDate("2026-11-03", 25), "2026-11-25");
  assert.equal(invoiceClosingDate("2026-11-27", 25), "2026-12-25");
});

test("Comexport: mês cheio + 10 dias, PIX", () => {
  const terms = { invoiced: true, invoice_closing_day: 0, payment_term_days: 10, reconciliation_business_days: 0 };
  assert.equal(clientDueDate("2026-11-03", terms), "2026-12-10");
  assert.equal(driverPayoutDate("2026-11-03", terms), "2026-12-10"); // quinta
  // Dezembro: fecha 31/12 + 10 = 10/01/2027 (domingo) → segunda 11/01
  assert.equal(driverPayoutDate("2026-12-15", terms), "2027-01-11");
});

test("CEP: boleto vence dia 30 + 2 dias úteis de conciliação", () => {
  assert.equal(driverPayoutDateFromClientDue("2026-11-30", 2), "2026-12-02");
  assert.equal(driverPayoutDateFromClientDue("2027-01-29", 2), "2027-02-02"); // sexta → terça
});

test("cliente que paga antes: no dia da corrida", () => {
  assert.equal(driverPayoutDate("2026-11-07", { invoiced: false }), "2026-11-09");
});

import { closeAllDropoffs, markDropoff, nextPendingDropoffIndex, passengerSummary } from "../src/lib/trips/trip-dropoff-stops-core.ts";

test("lista de passageiros: paradas de desembarque", () => {
  const stops = ([
    { passenger_name: "Marlene Souza", address_text: "Nova Rosa da Penha, Cariacica" },
    { passenger_name: "Vivian Lima", address_text: "Praia da Costa, Vila Velha" },
    { passenger_name: "Suzana Reis", address_text: "Eldorado, Serra" }
  ]);
  assert.equal(stops.length, 3);
  assert.equal(passengerSummary(stops), "Marlene, Vivian e Suzana");
  const a = markDropoff(stops, 0, "2026-11-04T22:00:00Z");
  assert.equal(nextPendingDropoffIndex(a), 1);
  assert.equal(markDropoff(a, 0), a); // já marcada
  const all = closeAllDropoffs(a, "2026-11-04T23:00:00Z");
  assert.equal(nextPendingDropoffIndex(all), null);
  assert.equal(all[0].dropped_at, "2026-11-04T22:00:00Z");
});
