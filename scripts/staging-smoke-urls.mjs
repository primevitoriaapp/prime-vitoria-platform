#!/usr/bin/env node
/**
 * URLs úteis para smoke humano (abrir no browser).
 * Env: BASE_URL (ou NEXT_PUBLIC_BASE_URL)
 */
import { applyBaseUrlFallback, loadEnvFiles } from "../src/lib/deploy/env-files.mjs";

loadEnvFiles();
applyBaseUrlFallback();

const base = (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.error("Defina BASE_URL");
  process.exit(1);
}

const trip = "c2000000-0000-4000-8000-000000000001";
const paths = [
  ["/login?next=/agenda", "Operador → agenda"],
  ["/login?next=/driver", "Motorista"],
  ["/login?next=/client", "Cliente"],
  [`/agenda?trip=${trip}`, "Agenda + corrida oficial"],
  ["/driver", "Painel motorista"],
  ["/client", "Portal cliente"],
  ["/api/health?detailed=1", "Health (JSON)"]
];

console.log(`\nSmoke URLs — ${base}\n`);
for (const [path, label] of paths) {
  console.log(`${label}\n  ${base}${path}\n`);
}
console.log("Contas: staging-operador@ / staging-motorista@ / staging-cliente@ (ver STAGING_E2E.md)\n");
