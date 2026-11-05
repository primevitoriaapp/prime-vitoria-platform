import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientScheduleMessage, greetingFor } from "../src/lib/messages/client-schedule-message.ts";

const base = {
  passenger_count: 1,
  flight_number: null,
  origin_text: "Hotel Senac Ilha do Boi, Vitória - ES, 29052-010, Brasil",
  destination_text: "Aeroporto de Vitória - ES"
};

test("saudação pelo horário de Brasília", () => {
  assert.equal(greetingFor(new Date("2026-11-05T12:00:00Z")), "Bom dia");
  assert.equal(greetingFor(new Date("2026-11-05T17:00:00Z")), "Boa tarde");
  assert.equal(greetingFor(new Date("2026-11-05T23:00:00Z")), "Boa noite");
});

test("lista em ordem, com motorista e carro; sem motorista diz 'a confirmar'; sem CEP nem 'Brasil'", () => {
  const msg = buildClientScheduleMessage({
    clientName: "Seg Pro",
    now: new Date("2026-11-05T12:00:00Z"),
    trips: [
      { ...base, scheduled_at: "2026-11-05T20:00:00Z", passenger_name: "Karla", driver_name: null, vehicle: null },
      {
        ...base,
        scheduled_at: "2026-11-05T17:00:00Z",
        passenger_name: "Carlos",
        driver_name: "João Vitor da Silva",
        vehicle: { brand: "Toyota", model: "Corolla", color: "Preto", plate: "ABC1D23" }
      }
    ]
  });
  assert.match(msg, /^Bom dia!/);
  assert.match(msg, /2 atendimentos\* agendados para \*Seg Pro\*/);
  assert.ok(msg.indexOf("14:00") < msg.indexOf("17:00"));
  assert.match(msg, /Motorista: João Silva · Toyota Corolla · Preto · placa ABC1D23/);
  assert.match(msg, /Motorista e veículo: a confirmar/);
  assert.doesNotMatch(msg, /29052|Brasil/);
  assert.doesNotMatch(msg, /\(27\) 9\d{4}-\d{4}.*Motorista/);
});

import { clientRefFromNotes } from "../src/lib/trips/client-ref.ts";
test("lê a NR do cliente das observações", () => {
  assert.equal(clientRefFromNotes("O.S./Ref.: NR263982-C1\nPlaca com nome"), "NR263982-C1");
  assert.equal(clientRefFromNotes("sem referência"), null);
});
