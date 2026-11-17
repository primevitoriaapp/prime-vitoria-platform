import { test } from "node:test";
import assert from "node:assert/strict";
import { findKnownPerson, knownPeopleFromTrips } from "../src/lib/clients/known-people.ts";

const TRT = "Tribunal Regional do Trabalho, Av. Nossa Sra. dos Navegantes, 1245";
const trips = [
  { trip_dropoff_stops: [{ passenger_name: "Catarina", address_text: "Praça Wolghano Neto, 214", lat: -20.28, lng: -40.29, passenger_phone: "21988918092" }, { passenger_name: "Marilia", address_text: TRT, final: true }] },
  { trip_dropoff_stops: [{ passenger_name: "Catarina", address_text: "Praça Wolghano Neto, 214" }, { passenger_name: "Marilia", address_text: "Av. Cmte. Álvaro Martins, 110" }] },
  { trip_pickup_stops: [{ passenger_name: "Marilia", pickup_text: "Av. Cmte. Álvaro Martins, 110" }] }
];

test("guarda o endereço que mais se repete e ignora o endereço do cliente", () => {
  const p = knownPeopleFromTrips(trips, [TRT]);
  const m = p.find((x) => x.name === "Marilia");
  assert.equal(m?.address, "Av. Cmte. Álvaro Martins, 110");
  const c = p.find((x) => x.name === "Catarina");
  assert.equal(c?.address, "Praça Wolghano Neto, 214");
  assert.equal(c?.phone, "21988918092");
});

test("acha por nome sem acento e pelo primeiro nome", () => {
  const p = knownPeopleFromTrips(trips, [TRT]);
  assert.equal(findKnownPerson(p, "marília")?.name, "Marilia");
  assert.equal(findKnownPerson(p, "CATARINA")?.name, "Catarina");
  assert.equal(findKnownPerson(p, "Ze"), null);
});
