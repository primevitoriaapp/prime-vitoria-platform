import { erpIntegrationMode } from "../integrations/erp-mode.ts";
import { getPushReadinessSnapshot } from "../notifications/push-readiness.ts";
import { trustHeaderAuth } from "./trust-header-auth.ts";

export type HealthPayload = {
  ok: boolean;
  service: string;
  time: string;
  checks?: {
    supabase_public: boolean;
    supabase_service: boolean;
    erp: { omie: "live" | "mock"; conta_azul: "live" | "mock" };
    cron_secret: boolean;
    fcm: boolean;
    fcm_web: boolean;
    fcm_operational_ready: boolean;
  };
  /** Sem segredos — diagnóstico de ambiente preview/staging. */
  staging_runtime?: {
    node_env: string;
    vercel_env: string | null;
    trust_header_auth: boolean;
    configured_base_url_host: string | null;
    vercel_url_host: string | null;
    base_url_matches_deployment: boolean | null;
  };
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

export function buildHealthPayload(detailed: boolean): HealthPayload {
  const payload: HealthPayload = {
    ok: true,
    service: "prime-vitoria-platform",
    time: new Date().toISOString()
  };

  if (!detailed) return payload;

  const supabasePublic = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
  const supabaseService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  const push = getPushReadinessSnapshot();
  payload.checks = {
    supabase_public: supabasePublic,
    supabase_service: supabaseService,
    erp: {
      omie: erpIntegrationMode("omie"),
      conta_azul: erpIntegrationMode("conta_azul")
    },
    cron_secret: Boolean(process.env.CRON_SECRET?.trim()),
    fcm: push.serverConfigured,
    fcm_web: push.firebaseWebConfigured,
    fcm_operational_ready: push.operationalReady
  };

  if (!supabasePublic) payload.ok = false;

  const baseHost = hostFromUrl(process.env.NEXT_PUBLIC_BASE_URL);
  const vercelHost = hostFromUrl(process.env.VERCEL_URL);
  payload.staging_runtime = {
    node_env: process.env.NODE_ENV ?? "unknown",
    vercel_env: process.env.VERCEL_ENV?.trim() || null,
    trust_header_auth: trustHeaderAuth(),
    configured_base_url_host: baseHost,
    vercel_url_host: vercelHost,
    base_url_matches_deployment:
      baseHost && vercelHost ? baseHost === vercelHost : baseHost ? null : null
  };

  return payload;
}
