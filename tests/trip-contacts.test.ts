import { test } from "node:test";
import assert from "node:assert/strict";
import { tripContacts, tripPeopleLabel } from "../src/lib/trips/trip-contacts.ts";

test("contatos vêm das paradas quando não há passageiro principal", () => {
  const trip = {
    passenger_name: null,
    passenger_phone: null,
    trip_dropoff_stops: [
      { passenger_name: "Catarina", passenger_phone: "21988918092" },
      { passenger_name: "Marilia", passenger_phone: "27999291139", final: true }
    ]
  };
  const c = tripContacts(trip);
  assert.equal(c.length, 2);
  assert.equal(c[0].phone, "21988918092");
  assert.equal(c[1].role, "Destino final");
  assert.equal(tripPeopleLabel(trip), "Catarina e Marilia");
});

test("não repete a mesma pessoa", () => {
  const c = tripContacts({ passenger_name: "Ana", passenger_phone: "(27) 99999-0000", trip_dropoff_stops: [{ passenger_name: "Ana", passenger_phone: "27999990000" }] });
  assert.equal(c.length, 1);
});
