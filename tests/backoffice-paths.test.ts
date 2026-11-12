import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BACKOFFICE_PATH_PREFIXES } from "../src/lib/ui/backoffice-paths.ts";

test("toda página do painel (admin) está na lista que esconde o cabeçalho antigo", () => {
  const dir = join(import.meta.dirname, "..", "src", "app", "(admin)");
  const routes = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory() && !n.startsWith("(") && !n.startsWith("_"));
  const missing = routes.filter((r) => !(BACKOFFICE_PATH_PREFIXES as readonly string[]).includes(`/${r}`));
  assert.deepEqual(missing, []);
});
