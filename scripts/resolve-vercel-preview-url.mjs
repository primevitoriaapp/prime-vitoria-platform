#!/usr/bin/env node
/**
 * Resolve BASE_URL do preview Vercel (PR comment ou env).
 * Uso: eval $(node scripts/resolve-vercel-preview-url.mjs --export)
 */
import {
  STAGING_OFFICIAL_PREVIEW_URL,
  STAGING_OFFICIAL_PR_NUMBER
} from "../src/lib/staging/official-preview.mjs";

const PREVIEW_RE =
  /https:\/\/prime-vitoria-web-git-[a-z0-9-]+-rubens-projects2\.vercel\.app/i;

function fromEnv() {
  const v = process.env.BASE_URL?.trim() || process.env.STAGING_BASE_URL?.trim();
  return v?.replace(/\/$/, "") || null;
}

async function fromGithubPr() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GITHUB_REPOSITORY?.trim() || "primevitoriaapp/prime-vitoria-platform";
  const pr = process.env.GITHUB_PR_NUMBER?.trim() || String(STAGING_OFFICIAL_PR_NUMBER);
  if (!token) return null;

  const res = await fetch(
    `https://api.github.com/repos/${repo}/issues/${pr}/comments?per_page=30`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }
  );
  if (!res.ok) return null;
  const comments = await res.json();
  for (const c of comments) {
    const body = c.body ?? "";
    const m = body.match(PREVIEW_RE);
    if (m) return m[0].replace(/\/$/, "");
  }
  return null;
}

async function main() {
  const url = fromEnv() ?? (await fromGithubPr()) ?? STAGING_OFFICIAL_PREVIEW_URL;
  if (process.argv.includes("--export")) {
    console.log(`export BASE_URL='${url}'`);
    return;
  }
  console.log(url);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
