#!/usr/bin/env node
/**
 * Imprime o quick start da sessão de smoke (apoio humano, sem substituir browser).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const doc = join(dir, "../docs/SMOKE_SESSAO_QUICK_START.md");

console.log(readFileSync(doc, "utf8"));
console.log("\n---\nRegisto: docs/STAGING_VALIDATION_EXECUTION_LOG.md\n");
