#!/usr/bin/env node
/**
 * Compara HTTP produção vs preview P1 (sem secrets).
 * Uso: npm run p1:compare-environments
 */
import {
  PRODUCTION_APP_URL,
  STAGING_OFFICIAL_BRANCH,
  STAGING_OFFICIAL_PREVIEW_URL
} from "../src/lib/staging/official-preview.mjs";

const P1_COMMIT = "3cd8522";

async function probe(label, url) {
  try {
    const res = await fetch(url.replace(/\/$/, ""), { redirect: "manual" });
    const text = await res.text();
    const vercelAuth = res.status === 401 && text.includes("Authentication Required");
    const hasP1Menu =
      text.includes("Clientes") && text.includes("Motoristas") && text.includes("Despacho");
    const hasOldMenu =
      text.includes("Utilizadores") && text.includes("Auditoria") && !hasP1Menu;
    return {
      label,
      url,
      status: res.status,
      vercelAuth,
      ui: hasP1Menu ? "P1 (menu cadastro)" : hasOldMenu ? "ANTIGA (produção)" : "indeterminado (login ou bloqueado)"
    };
  } catch (err) {
    return { label, url, status: "erro", vercelAuth: false, ui: err.message };
  }
}

console.log(`
=== Comparação ambientes P1 ===
Branch P1: ${STAGING_OFFICIAL_BRANCH} @ ${P1_COMMIT}
`);

const rows = await Promise.all([
  probe("PRODUÇÃO (não homologar P1)", PRODUCTION_APP_URL),
  probe("PREVIEW P1 (homologar aqui)", STAGING_OFFICIAL_PREVIEW_URL)
]);

console.log("| Ambiente | HTTP | UI | URL |");
console.log("|----------|------|-----|-----|");
for (const r of rows) {
  const block = r.vercelAuth ? " + Vercel Auth 401" : "";
  console.log(`| ${r.label} | ${r.status}${block} | ${r.ui} | ${r.url} |`);
}

console.log(`
Homologação: use só PREVIEW P1.
Amanhã: docs/AMANHA_P1.md · npm run p1:check-preview
`);

const preview = rows[1];
if (preview.status === 401 && preview.vercelAuth) {
  process.exit(1);
}
if (rows[0].ui?.includes("ANTIGA")) {
  console.log("OK: produção confirmada como UI antiga (esperado).\n");
}
process.exit(preview.status === 200 ? 0 : 1);
