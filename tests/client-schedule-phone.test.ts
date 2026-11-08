import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientScheduleMessage, formatPhoneBr } from "../src/lib/messages/client-schedule-message.ts";

test("mensagem da agenda leva o telefone do motorista quando definido", () => {
  const base = { scheduled_at: "2026-11-09T12:00:00Z", passenger_name: "Ana", passenger_count: 1, origin_text: "A", destination_text: "B", flight_number: null, vehicle: null };
  const txt = buildClientScheduleMessage({ clientName: "X", trips: [{ ...base, driver_name: "Brendo de Assis Meira", driver_phone: "5527999990000" }] });
  assert.match(txt, /📞 Contato do motorista: \(27\) 99999-0000/);
  const sem = buildClientScheduleMessage({ clientName: "X", trips: [{ ...base, driver_name: null, driver_phone: "27999990000" }] });
  assert.doesNotMatch(sem, /Contato do motorista/);
  assert.equal(formatPhoneBr("2721428307"), "(27) 2142-8307");
});
