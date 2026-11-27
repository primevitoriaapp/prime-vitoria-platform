// Roda os testes automáticos antes de publicar. Se algum falhar, a publicação para
// e a versão que já está no ar continua funcionando.
// Emergência: SKIP_PREDEPLOY_TESTS=1 na Vercel publica sem testar.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

if (process.env.SKIP_PREDEPLOY_TESTS === "1") {
  console.log("[testes] pulados (SKIP_PREDEPLOY_TESTS=1)");
  process.exit(0);
}
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 6)) {
  console.log(`[testes] Node ${process.versions.node} não roda os testes .ts; seguindo sem testar.`);
  process.exit(0);
}
const files = readdirSync("tests").filter((f) => f.endsWith(".test.ts")).map((f) => `tests/${f}`);
const r = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], {
  stdio: "inherit",
  env: { ...process.env, SKIP_NETWORK_TESTS: "1", TZ: process.env.TZ ?? "UTC" }
});
if (r.status !== 0) {
  console.error("\n[testes] ❌ Algum teste falhou: a publicação foi cancelada. A versão anterior continua no ar.");
  process.exit(r.status ?? 1);
}
console.log("[testes] ✅ Todos os testes passaram.");
