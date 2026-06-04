#!/usr/bin/env node
/** Imprime o guia AMANHA_P1.md no terminal. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const doc = join(dirname(fileURLToPath(import.meta.url)), "../docs/AMANHA_P1.md");
console.log(readFileSync(doc, "utf8"));
