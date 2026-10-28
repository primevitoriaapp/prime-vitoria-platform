import test from "node:test";
import assert from "node:assert/strict";
import { mapAutocompleteResponse, mapDetailsResponse } from "../src/lib/integrations/google-places.ts";

test("mapAutocompleteResponse lê as sugestões", () => {
  const out = mapAutocompleteResponse({
    suggestions: [
      {
        placePrediction: {
          placeId: "abc",
          text: { text: "Cox Sport - Serra, ES, Brasil" },
          structuredFormat: { mainText: { text: "Cox Sport" }, secondaryText: { text: "Serra - ES, Brasil" } }
        }
      },
      { placePrediction: {} }
    ]
  });
  assert.deepEqual(out, [{ place_id: "abc", main_text: "Cox Sport", secondary_text: "Serra - ES" }]);
});

test("mapDetailsResponse monta nome + endereço com coordenadas", () => {
  const p = mapDetailsResponse({
    id: "abc",
    displayName: { text: "Golden Tulip Porto Vitória" },
    formattedAddress: "Av. Nossa Sra. dos Navegantes, 635 - Enseada do Suá, Vitória - ES, 29050-912, Brasil",
    location: { latitude: -20.31, longitude: -40.29 }
  });
  assert.deepEqual(p, {
    place_id: "abc",
    display_name: "Golden Tulip Porto Vitória, Av. Nossa Sra. dos Navegantes, 635 - Enseada do Suá, Vitória - ES",
    lat: -20.31,
    lng: -40.29
  });
  assert.equal(mapDetailsResponse({ id: "x" }), null);
});
