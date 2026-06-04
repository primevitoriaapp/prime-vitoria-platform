import test from "node:test";
import assert from "node:assert/strict";
import { NOMINATIM_USER_AGENT, searchNominatimBrazil } from "../src/lib/integrations/nominatim-search.ts";

test("NOMINATIM_USER_AGENT is set for OSM policy", () => {
  assert.match(NOMINATIM_USER_AGENT, /PrimeVitoria/);
  assert.match(NOMINATIM_USER_AGENT, /primevitoria/);
});

test("searchNominatimBrazil rejects short query", async () => {
  const out = await searchNominatimBrazil("ab");
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.error.code, "QUERY_TOO_SHORT");
});

test("searchNominatimBrazil finds Aeroporto de Vitória ES", async (t) => {
  if (process.env.SKIP_NETWORK_TESTS === "1") {
    t.skip("network disabled");
  }
  const out = await searchNominatimBrazil("Aeroporto de Vitória ES");
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.ok(out.data.length >= 1);
    assert.match(out.data[0]!.display_name, /Vitória/i);
    assert.ok(out.data[0]!.lat < 0);
    assert.ok(out.data[0]!.lng < 0);
  }
});

test("searchNominatimBrazil finds Shopping Vitória ES", async (t) => {
  if (process.env.SKIP_NETWORK_TESTS === "1") {
    t.skip("network disabled");
  }
  const out = await searchNominatimBrazil("Shopping Vitória ES");
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.ok(out.data.length >= 1);
    assert.match(out.data[0]!.display_name, /Vitória|Brasil/i);
  }
});
