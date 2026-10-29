/**
 * Web Push padrão (RFC 8291 aes128gcm + VAPID RFC 8292) só com o crypto do Node.
 * Funciona em Android (Chrome), computador e iPhone com o app adicionado à tela de início (iOS 16.4+).
 */
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";

export const b64u = {
  enc: (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")
};

export type VapidKeys = { publicKey: string; privateKey: string };

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u.enc(ecdh.getPublicKey()), privateKey: b64u.enc(ecdh.getPrivateKey()) };
}

/** Cabeçalho Authorization "vapid t=…, k=…" para o servidor de push do navegador. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const aud = new URL(endpoint).origin;
  const header = b64u.enc(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.enc(Buffer.from(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject })));
  const pub = b64u.dec(keys.publicKey);
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64u.enc(pub.subarray(1, 33)), y: b64u.enc(pub.subarray(33, 65)) },
    format: "jwk"
  });
  const sig = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u.enc(sig)}, k=${keys.publicKey}`;
}

/** Criptografa a mensagem para a assinatura do aparelho (um registro, aes128gcm). */
export function encryptPushPayload(
  plaintext: Buffer,
  subscription: { p256dh: string; auth: string },
  opts?: { salt?: Buffer; serverEcdh?: ReturnType<typeof createECDH> }
): Buffer {
  const uaPublic = b64u.dec(subscription.p256dh);
  const authSecret = b64u.dec(subscription.auth);
  const ecdh = opts?.serverEcdh ?? createECDH("prime256v1");
  if (!opts?.serverEcdh) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const salt = opts?.salt ?? randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}
