import { test } from "node:test";
import assert from "node:assert/strict";
import { teamMissingAddress, teamTripShape } from "../src/lib/trips/team-trip.ts";

const cosme = { id: "1", name: "Cosme Silva", phone: "27 9", address: "Rua A, 10 - Serra/ES" };
const eziel = { id: "2", name: "Eziel Souza", phone: null, address: "Rua B, 20 - Vitória/ES" };

test("um funcionário buscado em casa: endereço vira o embarque, sem paradas", () => {
  const s = teamTripShape([cosme], "buscar")!;
  assert.equal(s.originText, cosme.address);
  assert.equal(s.pickupStops, null);
  assert.equal(s.passengerName, "Cosme Silva");
});

test("dois buscados: paradas de embarque na ordem, primeiro endereço é a origem", () => {
  const s = teamTripShape([cosme, eziel], "buscar")!;
  assert.equal(s.originText, cosme.address);
  assert.equal(s.pickupStops?.length, 2);
  assert.equal(s.pickupStops?.[1].pickup_text, eziel.address);
  assert.equal(s.passengerName, "Cosme e Eziel");
  assert.equal(s.passengerCount, 2);
});

test("levar para casa: último endereço é o destino e cada um vira parada de desembarque", () => {
  const s = teamTripShape([cosme, eziel], "levar")!;
  assert.equal(s.destinationText, eziel.address);
  assert.equal(s.dropoffStops?.[0].address_text, cosme.address);
  assert.equal(s.originText, null);
});

test("aponta quem está sem endereço", () => {
  assert.deepEqual(teamMissingAddress([cosme, { ...eziel, address: "" }]), ["Eziel Souza"]);
  assert.equal(teamTripShape([], "buscar"), null);
});
