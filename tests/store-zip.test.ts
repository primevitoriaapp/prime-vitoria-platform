import { test } from "node:test";
import assert from "node:assert/strict";
import { buildZip } from "../src/lib/zip/store-zip.ts";

test("zip começa e termina com as assinaturas certas", () => {
  const z = buildZip([{ path: "a/ção.txt", data: new TextEncoder().encode("olá") }]);
  assert.equal(new DataView(z.buffer).getUint32(0, true), 0x04034b50);
  assert.equal(new DataView(z.buffer).getUint32(z.length - 22, true), 0x06054b50);
});
