import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { isCronSecretAuthorized } from "@/lib/security/cron-auth";
import { sweepDueFlights } from "@/lib/integrations/flight-watch";

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

/** Acompanhamento de voos (Flightradar24): roda a cada 5 min pelo agendador do Supabase, com ou sem painel aberto. */
async function handle(request: Request) {
  if (!isCronSecretAuthorized(request) && !(await dbCronKeyOk(request))) return fail("UNAUTHORIZED", "Cron não autorizado", 401);
  try {
    return ok({ cron: "flights", ...(await sweepDueFlights()) });
  } catch (error) {
    return fail("CRON_FLIGHTS_FAILED", error instanceof Error ? error.message : String(error), 500);
  }
}

export const GET = handle;
export const POST = handle;
