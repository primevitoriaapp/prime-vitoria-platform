import test from "node:test";
import assert from "node:assert/strict";
import { shortAddress } from "../src/lib/client/short-address.ts";

test("shortAddress encurta endereço do mapa", () => {
  assert.equal(
    shortAddress(
      "Aeroporto Internacional de Vitória - Eurico de Aguiar Salles, Rua Jacinto Bresciani, República, Distrito Goiabeiras, Vitória, Espírito Santo, Região Sudeste, 29070-010, Brasil"
    ),
    "Aeroporto Internacional de Vitória - Eurico de Aguiar Salles"
  );
  assert.equal(
    shortAddress("Avenida República, Centro, Vitória, Espírito Santo, Região Sudeste, 29018-310, Brasil"),
    "Avenida República, Centro · Vitória"
  );
  assert.equal(
    shortAddress("Rod. Governador Mário Covas, 3101 - km 282 - Padre Mathias, Cariacica - ES, 29158-900"),
    "Rod. Governador Mário Covas, 3101 - km 282 - Padre Mathias · Cariacica"
  );
  assert.equal(shortAddress("Ed ULTRAMAR CENTRO DE VITORIA"), "Ed ULTRAMAR CENTRO DE VITORIA");
  assert.equal(shortAddress("Vila Velha, Espírito Santo, Região Sudeste, Brasil"), "Vila Velha");
});
