import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from "node:crypto";
import { b64u, encryptPushPayload, generateVapidKeys, vapidAuthorization } from "../src/lib/push/web-push-crypto.ts";

test("aparelho consegue descriptografar a mensagem (RFC 8291)", () => {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = randomBytes(16);
  const msg = Buffer.from(JSON.stringify({ title: "Nova corrida", body: "Aeroporto → Hotel" }));
  const out = encryptPushPayload(msg, { p256dh: b64u.enc(ua.getPublicKey()), auth: b64u.enc(auth) });
  // lado do aparelho
  const salt = out.subarray(0, 16);
  assert.equal(out.readUInt32BE(16), 4096);
  const idlen = out[20];
  const asPublic = out.subarray(21, 21 + idlen);
  const ct = out.subarray(21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2);
  assert.deepEqual(plain.subarray(0, -1), msg);
});

test("assinatura VAPID confere com a chave pública", () => {
  const keys = generateVapidKeys();
  const h = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, "mailto:contato@primevitoria.com", 1_700_000_000);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m);
  const claims = JSON.parse(b64u.dec(m![2]).toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.exp, 1_700_000_000 + 43200);
  const pub = b64u.dec(keys.publicKey);
  const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u.enc(pub.subarray(1, 33)), y: b64u.enc(pub.subarray(33, 65)) }, format: "jwk" });
  assert.ok(verify("sha256", Buffer.from(`${m![1]}.${m![2]}`), { key, dsaEncoding: "ieee-p1363" }, b64u.dec(m![3])));
  assert.equal(m![4], keys.publicKey);
});
