import assert from "node:assert/strict";
import { formatRouteShort, shortPlaceLabel, truncatePlaceLabel } from "../src/lib/trips/format-place-label.ts";

assert.equal(
  shortPlaceLabel(
    "Aeroporto Internacional de Vitória, Aeroporto, Vitória, Espírito Santo, 29075-787, Brasil"
  ),
  "Aeroporto Internacional de Vitória"
);

assert.equal(truncatePlaceLabel("Aeroporto Internacional de Vitória", 20), "Aeroporto Internaci…");

assert.equal(
  formatRouteShort(
    "Hotel Praia do Canto, Vitória, ES, Brasil",
    "Shopping Vitória, Vitória, ES, Brasil"
  ),
  "Hotel Praia do Canto → Shopping Vitória"
);

console.log("format-place-label.test.ts OK");
