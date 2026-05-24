#!/usr/bin/env node
/**
 * Cria PR night-cycle → pricing-engine via GitHub API (credencial git).
 * Uso: node scripts/create-night-pr.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const OWNER = "primevitoriaapp";
const REPO = "prime-vitoria-platform";
const HEAD = "cursor/night-cycle-hardening";
const BASE = "cursor/pricing-engine-mvp-cycle";
const TITLE = "Night cycle: hardening, pricing flags, driver UX (prep)";

function gitCredentialPassword() {
  const out = execSync('printf "protocol=https\\nhost=github.com\\n\\n" | git credential fill', {
    encoding: "utf8"
  });
  const line = out.split("\n").find((l) => l.startsWith("password="));
  if (!line) throw new Error("No GitHub password/token from git credential");
  return line.slice("password=".length);
}

function bodyFromFile() {
  return readFileSync(new URL("../docs/NIGHT_CYCLE_PR_BODY.md", import.meta.url), "utf8");
}

async function main() {
  const token = gitCredentialPassword();
  const existing = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/pulls?head=${OWNER}:${HEAD}&state=open`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }
  );
  const open = await existing.json();
  if (Array.isArray(open) && open.length > 0) {
    console.log(open[0].html_url);
    return;
  }

  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      title: TITLE,
      head: HEAD,
      base: BASE,
      body: bodyFromFile()
    })
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  }
  console.log(json.html_url);
  console.log(json.number);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
