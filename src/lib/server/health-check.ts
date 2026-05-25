import { erpIntegrationMode } from "../integrations/erp-mode.ts";
import { getPushReadinessSnapshot } from "../notifications/push-readiness.ts";

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
};

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

  return payload;
}
