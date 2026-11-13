import { test } from "node:test";
import assert from "node:assert/strict";
import { driverIntroMessage } from "../src/lib/trips/driver-intro-message.ts";

test("apresentação traz nome, horário, embarque, destino da pessoa, carro, placa e contato", () => {
  const trip = {
    scheduled_at: "2030-11-13T22:00:00+00:00",
    origin_text: "Tribunal Regional do Trabalho da 17ª Região, Av. Nossa Sra. dos Navegantes, 1245 - Enseada do Suá, Vitória - ES",
    destination_text: "Avenida Comandante Álvaro Martins, 110, Mata da Praia",
    passenger_name: null,
    flight_number: null
  };
  const m = driverIntroMessage(trip, { name: "Rubens", phone: "27998063956", vehicle: { model: "Toyota Corolla", color: "Preto", plate: "abc1d23" } }, { name: "Catarina", dropoff: "Praça Wolghano Neto - Jardim da Penha, Vitória - ES" });
  console.log(m);
  assert.match(m, /Olá, Catarina!/);
  assert.match(m, /Me chamo Rubens/);
  assert.match(m, /19:00/);
  assert.match(m, /Tribunal Regional do Trabalho da 17ª Região, Av\. Nossa Sra\. dos Navegantes/);
  assert.match(m, /Praça Wolghano Neto/);
  assert.match(m, /Toyota Corolla Preto · placa \*ABC1D23\*/);
  assert.match(m, /\(27\) 99806-3956/);
});
