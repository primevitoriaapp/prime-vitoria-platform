import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { isCronSecretAuthorized } from "@/lib/security/cron-auth";
import { runHealthCheck } from "@/lib/health/run-and-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function dbCronKeyOk(request: Request): Promise<boolean> {
  const got = request.headers.get("x-prime-cron")?.trim() ?? "";
  if (got.length < 20) return false;
  const { data } = await db.from("app_secrets").select("value").eq("key", "cron_late_departure").maybeSingle();
  const want = String((data?.value as { token?: string } | null)?.token ?? "");
  if (want.length < 20 || want.length !== got.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

/** Checagem diária do sistema (7h = manhã, 18h = tarde). Chamada pelo agendador do Supabase. */
async function handle(request: Request) {
  if (!isCronSecretAuthorized(request) && !(await dbCronKeyOk(request))) return fail("UNAUTHORIZED", "Cron não autorizado", 401);
  try {
    const slot = new URL(request.url).searchParams.get("slot") === "tarde" ? "tarde" : "manha";
    const { data: tenants } = await db.from("tenants").select("id");
    const out: { tenant: string; problems: number; critical: number }[] = [];
    for (const t of tenants ?? []) {
      const r = await runHealthCheck(t.id as string, slot);
      out.push({ tenant: t.id as string, problems: r.problems, critical: r.critical });
    }
    return ok({ cron: "health-check", slot, out });
  } catch (error) {
    return fail("CRON_HEALTH_FAILED", error instanceof Error ? error.message : String(error), 500);
  }
}

export const GET = handle;
export const POST = handle;
