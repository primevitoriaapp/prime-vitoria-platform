import {
  PRODUCTION_APP_URL,
  STAGING_OFFICIAL_BRANCH,
  STAGING_OFFICIAL_PREVIEW_URL
} from "@/lib/staging/official-preview";

const P1_COMMIT_SHORT = "3cd8522";
const STAGING_EMAILS = [
  "staging-admin@example.com",
  "staging-operador@example.com",
  "staging-financeiro@example.com",
  "staging-motorista@example.com",
  "staging-cliente@example.com"
] as const;

export type StagingStatusPayload = {
  ok: boolean;
  time: string;
  homologation: {
    official_preview_url: string;
    production_url: string;
    do_not_use_for_p1: string;
    p1_branch: string;
    p1_commit_expected: string;
  };
  deployment: {
    vercel_env: string | null;
    vercel_url_host: string | null;
    git_commit_sha: string | null;
    git_commit_ref: string | null;
    is_preview: boolean;
    is_production: boolean;
  };
  config: {
    supabase_public_configured: boolean;
    supabase_service_configured: boolean;
    base_url_host: string | null;
    base_url_matches_vercel: boolean | null;
    smoke_hints_enabled: boolean;
  };
  migration_0044: {
    checked: boolean;
    ready: boolean | null;
    detail: string | null;
  };
  migration_0045: {
    checked: boolean;
    ready: boolean | null;
    detail: string | null;
  };
  staging_seed: {
    checked: boolean;
    users_expected: number;
    users_found: number | null;
    detail: string | null;
  };
  is_p1_environment: boolean;
  warnings: string[];
  blockers: string[];
  next_steps: string[];
};

function hostFromUrl(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    return new URL(v.startsWith("http") ? v : `https://${v}`).host;
  } catch {
    return null;
  }
}

async function checkMigration0044(): Promise<{ ready: boolean; detail: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    return { ready: false, detail: "Supabase service role não configurado no servidor" };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false } });

  const { error } = await client.from("clients").select("trade_name").limit(1);
  if (!error) {
    return { ready: true, detail: "Coluna clients.trade_name presente" };
  }
  const msg = error.message ?? String(error);
  if (/column|does not exist|schema cache/i.test(msg)) {
    return { ready: false, detail: "Coluna clients.trade_name ausente — aplicar migration 0044" };
  }
  return { ready: false, detail: `Erro ao verificar: ${msg}` };
}

async function checkMigration0045(): Promise<{ ready: boolean; detail: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    return { ready: false, detail: "Supabase service role não configurado no servidor" };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false } });

  const { error } = await client.from("drivers").select("photo_url").limit(1);
  if (!error) {
    return { ready: true, detail: "Coluna drivers.photo_url presente" };
  }
  const msg = error.message ?? String(error);
  if (/column|does not exist|schema cache/i.test(msg)) {
    return { ready: false, detail: "Coluna drivers.photo_url ausente — aplicar migration 0045" };
  }
  return { ready: false, detail: `Erro ao verificar: ${msg}` };
}

async function checkStagingUsers(): Promise<{ found: number; detail: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    return { found: 0, detail: "Supabase service role não configurado" };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false } });
  const admin = client.auth.admin;

  const found = new Set<string>();
  let page = 1;
  const perPage = 200;

  for (;;) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) {
      return { found: 0, detail: `listUsers: ${error.message}` };
    }
    for (const u of data.users) {
      const email = u.email?.toLowerCase();
      if (email && (STAGING_EMAILS as readonly string[]).includes(email)) {
        found.add(email);
      }
    }
    if (data.users.length < perPage) break;
    page += 1;
    if (page > 20) break;
  }

  return {
    found: found.size,
    detail:
      found.size === STAGING_EMAILS.length
        ? "Todos os utilizadores staging encontrados"
        : `Encontrados ${found.size}/${STAGING_EMAILS.length} — correr seed`
  };
}

export async function buildStagingStatusPayload(): Promise<StagingStatusPayload> {
  const warnings: string[] = [];
  const vercelEnv = process.env.VERCEL_ENV?.trim() || null;
  const vercelHost = hostFromUrl(process.env.VERCEL_URL);
  const baseHost = hostFromUrl(process.env.NEXT_PUBLIC_BASE_URL);
  const isPreview = vercelEnv === "preview";
  const isProduction = vercelEnv === "production";

  if (isProduction) {
    warnings.push("Este deployment é PRODUÇÃO — não homologar P1 aqui. Use a URL do preview.");
  }
  if (baseHost && vercelHost && baseHost !== vercelHost) {
    warnings.push(
      `NEXT_PUBLIC_BASE_URL (${baseHost}) ≠ VERCEL_URL (${vercelHost}) — cookies/API podem falhar`
    );
  }
  if (baseHost === hostFromUrl(PRODUCTION_APP_URL)) {
    warnings.push("NEXT_PUBLIC_BASE_URL aponta para produção — corrigir no Vercel Preview");
  }

  const supabasePublic = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
  const supabaseService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  let migration = { checked: false, ready: null as boolean | null, detail: null as string | null };
  if (supabaseService) {
    const m = await checkMigration0044();
    migration = { checked: true, ready: m.ready, detail: m.detail };
    if (!m.ready) warnings.push(m.detail);
  }

  let migration0045 = { checked: false, ready: null as boolean | null, detail: null as string | null };
  if (supabaseService) {
    const m = await checkMigration0045();
    migration0045 = { checked: true, ready: m.ready, detail: m.detail };
    if (!m.ready) warnings.push(m.detail);
  }

  let seed = {
    checked: false,
    users_expected: STAGING_EMAILS.length,
    users_found: null as number | null,
    detail: null as string | null
  };
  if (supabaseService) {
    const s = await checkStagingUsers();
    seed = {
      checked: true,
      users_expected: STAGING_EMAILS.length,
      users_found: s.found,
      detail: s.detail
    };
    if (s.found < STAGING_EMAILS.length) {
      warnings.push("Seed incompleto — workflow Staging seed (remote)");
    }
  }

  const gitRef = process.env.VERCEL_GIT_COMMIT_REF?.trim() || null;
  const isP1Branch = gitRef === STAGING_OFFICIAL_BRANCH;
  const isP1Environment = isPreview && (isP1Branch || Boolean(vercelHost?.includes("git-cursor-pricing")));

  const blockers: string[] = [];
  const next_steps: string[] = [];

  if (isProduction) {
    blockers.push("Deployment é produção — use a URL do preview P1 (docs/P1_HOMOLOGACAO_URL_OFICIAL.md)");
  }
  if (!isP1Environment && isPreview) {
    blockers.push("Branch/commit não é o preview P1 — confirmar deployment da branch cursor/pricing-engine-mvp-cycle");
  }
  if (!supabasePublic) blockers.push("NEXT_PUBLIC_SUPABASE_URL ou ANON_KEY em falta no Vercel Preview");
  if (!supabaseService) blockers.push("SUPABASE_SERVICE_ROLE_KEY em falta no Vercel Preview");
  if (migration.checked && migration.ready === false) {
    blockers.push("Migration 0044 não aplicada — Actions → Staging migration 0044");
  }
  if (migration0045.checked && migration0045.ready === false) {
    blockers.push("Migration 0045 não aplicada — Actions → Staging migration 0045 (foto motorista)");
  }
  if (seed.checked && (seed.users_found ?? 0) < STAGING_EMAILS.length) {
    blockers.push("Seed staging incompleto — Actions → Staging seed (remote), reset_password=true");
  }

  if (blockers.length > 0) {
    next_steps.push("Rubens: desactivar Vercel Authentication no preview (docs/P1_VERCEL_PREVIEW_ACESSO.md)");
    next_steps.push("Configurar secrets: docs/P1_SECRETS_CHECKLIST.md");
    next_steps.push("Correr workflows 0044 + 0045 + seed; depois abrir docs/AMANHA_P1.md");
  } else if (!isP1Environment) {
    next_steps.push("Abrir URL oficial P1 e /staging-status — docs/P1_HOMOLOGACAO_URL_OFICIAL.md");
  } else {
    next_steps.push("Login operador: staging-operador@example.com — checklist docs/P1_CHECKLIST_HOMOLOGACAO.md");
  }

  const ok =
    isP1Environment &&
    supabasePublic &&
    supabaseService &&
    migration.ready === true &&
    migration0045.ready === true &&
    (seed.users_found ?? 0) >= STAGING_EMAILS.length &&
    blockers.length === 0;

  return {
    ok,
    time: new Date().toISOString(),
    homologation: {
      official_preview_url: STAGING_OFFICIAL_PREVIEW_URL,
      production_url: PRODUCTION_APP_URL,
      do_not_use_for_p1: PRODUCTION_APP_URL,
      p1_branch: STAGING_OFFICIAL_BRANCH,
      p1_commit_expected: P1_COMMIT_SHORT
    },
    deployment: {
      vercel_env: vercelEnv,
      vercel_url_host: vercelHost,
      git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null,
      git_commit_ref: gitRef,
      is_preview: isPreview,
      is_production: isProduction
    },
    config: {
      supabase_public_configured: supabasePublic,
      supabase_service_configured: supabaseService,
      base_url_host: baseHost,
      base_url_matches_vercel: baseHost && vercelHost ? baseHost === vercelHost : null,
      smoke_hints_enabled:
        process.env.NEXT_PUBLIC_STAGING_SMOKE_HINTS?.trim().toLowerCase() === "true"
    },
    migration_0044: migration,
    migration_0045: migration0045,
    staging_seed: seed,
    is_p1_environment: isP1Environment,
    warnings,
    blockers,
    next_steps
  };
}
