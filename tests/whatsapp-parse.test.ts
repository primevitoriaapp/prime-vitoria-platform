import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWebhook } from "../src/lib/whatsapp/parse.ts";

const wrap = (field: string, value: unknown) => ({ object: "whatsapp_business_account", entry: [{ id: "1", changes: [{ field, value }] }] });

test("mensagem recebida de cliente", () => {
  const r = parseWebhook(wrap("messages", { contacts: [{ wa_id: "5527998063956", profile: { name: "Fulano" } }], messages: [{ id: "wamid.A", from: "5527998063956", type: "text", text: { body: "Oii" }, timestamp: "1795628192" }] }));
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].direction, "in");
  assert.equal(r.messages[0].body, "Oii");
  assert.equal(r.contacts[0].profile_name, "Fulano");
});

test("eco do app e status", () => {
  const r = parseWebhook(wrap("smb_message_echoes", { message_echoes: [{ id: "wamid.B", from: "552721428307", to: "5527999990000", type: "image", image: { id: "M1", caption: "placa" }, timestamp: "1795628200" }] }));
  assert.equal(r.messages[0].direction, "out");
  assert.equal(r.messages[0].source, "app");
  assert.equal(r.messages[0].media_id, "M1");
  const s = parseWebhook(wrap("messages", { statuses: [{ id: "wamid.B", status: "read" }] }));
  assert.equal(s.statuses[0].status, "read");
});

test("histórico e contatos da agenda", () => {
  const r = parseWebhook(
    wrap("history", {
      history: [{ threads: [{ id: "5527988887777", messages: [
        { id: "h1", from: "5527988887777", type: "text", text: { body: "bom dia" }, timestamp: "1795600000" },
        { id: "h2", from: "552721428307", type: "text", text: { body: "bom dia!" }, timestamp: "1795600100" },
        { id: "h3", from: "5527988887777", type: "errors", timestamp: "1795600200" }
      ] }] }]
    })
  );
  assert.deepEqual(r.messages.map((m) => m.direction), ["in", "out"]);
  const c = parseWebhook(wrap("smb_app_state_sync", { state_sync: [{ type: "contact", action: "add", contact: { full_name: "Denis Motorista", phone_number: "5527997061933" } }] }));
  assert.equal(c.contacts[0].name, "Denis Motorista");
});
