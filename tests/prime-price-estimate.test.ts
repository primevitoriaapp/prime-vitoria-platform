import assert from "node:assert/strict";
import { test } from "node:test";
import { estimatePrimeTripAmounts } from "../src/lib/pricing/prime-price-estimate.ts";

const coords = {
  origin_lat: -20.3155,
  origin_lng: -40.3128,
  destination_lat: -20.29,
  destination_lng: -40.28
};

test("per_km com mínimo 20km — Comexport exemplo", () => {
  const est = estimatePrimeTripAmounts(
    {
      charge_type: "per_km",
      price_per_km: 3.5,
      min_km: 20,
      driver_price_per_km: 2.5,
      driver_min_km: 20
    },
    coords
  );
  assert.ok(est.planned_km != null && est.planned_km > 0);
  assert.equal(est.billable_km, Math.max(est.planned_km!, 20));
  assert.equal(est.client_amount, est.billable_km! * 3.5);
  assert.equal(est.driver_amount, est.billable_km! * 2.5);
  assert.equal(est.margin, est.client_amount - est.driver_amount);
});

test("valor fixo — transfer 180 / motorista 80", () => {
  const est = estimatePrimeTripAmounts(
    {
      charge_type: "fixed",
      fixed_price: 180,
      driver_fixed_price: 80
    },
    coords
  );
  assert.equal(est.client_amount, 180);
  assert.equal(est.driver_amount, 80);
  assert.equal(est.margin, 100);
});

test("diária 850 / 550", () => {
  const est = estimatePrimeTripAmounts(
    {
      charge_type: "daily",
      fixed_price: 850,
      driver_fixed_price: 550
    },
    coords
  );
  assert.equal(est.client_amount, 850);
  assert.equal(est.driver_amount, 550);
  assert.equal(est.margin, 300);
});
