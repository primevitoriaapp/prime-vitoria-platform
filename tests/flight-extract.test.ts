import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFlightNumber } from "../src/lib/trips/flight-extract.ts";

test("acha o voo em textos de voucher", () => {
  assert.equal(extractFlightNumber("Passageiro chega no voo LA 3844 às 14h"), "LA3844");
  assert.equal(extractFlightNumber("VÔO: G3-1844"), "G31844");
  assert.equal(extractFlightNumber("Nº do voo AD4512"), "AD4512");
  assert.equal(extractFlightNumber("Chegada LATAM 3844 - aguardar no desembarque"), "LA3844");
  assert.equal(extractFlightNumber("voo 1844 da Gol"), "G31844");
  assert.equal(extractFlightNumber("Aeroporto de Vitória - desembarque LA3844"), "LA3844");
  assert.equal(extractFlightNumber("Flight TP 0075"), "TP0075");
});

test("não inventa voo", () => {
  assert.equal(extractFlightNumber("Rua das Palmeiras, 1234 - Jardim Camburi"), null);
  assert.equal(extractFlightNumber("Hotel Ilha do Boi, apto 1844"), null);
  assert.equal(extractFlightNumber("Aeroporto de Vitória, Av. Roza Helena 1500"), null);
  assert.equal(extractFlightNumber(""), null);
});
