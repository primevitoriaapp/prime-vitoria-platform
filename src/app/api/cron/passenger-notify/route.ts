import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { isCronSecretAuthorized } from "@/lib/security/cron-auth";
import { notifyPassengers } from "@/lib/messages/passenger-notify";
import { confirmSendAt } from "@/lib/messages/passenger-whatsapp-templates";
import { getWhatsappCloudConfig } from "@/lib/messages/whatsapp-cloud";

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

/** "Motorista confirmado": véspera às 18h (ou logo que o motorista confirmar, se for no mesmo dia). */
async function handle(request: Request) {
  if (!isCronSecretAuthorized(request) && !(await dbCronKeyOk(request))) return fail("UNAUTHORIZED", "Cron não autorizado", 401);
  const cfg = await getWhatsappCloudConfig();
  if (cfg.mode === "desligado") return ok({ skipped: "desligado" });
  const now = Date.now();
  const { data } = await db
    .from("trips")
    .select("id, tenant_id, scheduled_at")
    .not("driver_id", "is", null)
    .in("operational_status", ["accepted", "approved", "reassigned"])
    .gte("scheduled_at", new Date(now + 20 * 60000).toISOString())
    .lte("scheduled_at", new Date(now + 48 * 3600000).toISOString())
    .limit(200);
  const due = (data ?? []).filter((t) => confirmSendAt(String(t.scheduled_at)).getTime() <= now);
  if (!due.length) return ok({ due: 0 });
  const { data: done } = await db.from("passenger_notifications").select("trip_id").eq("kind", "confirmado").in("trip_id", due.map((t) => t.id));
  const doneSet = new Set((done ?? []).map((d) => d.trip_id as string));
  let sent = 0;
  let simulated = 0;
  for (const t of due.filter((x) => !doneSet.has(x.id as string))) {
    const r = await notifyPassengers(t.tenant_id as string, t.id as string, "confirmado").catch(() => null);
    sent += r?.sent ?? 0;
    simulated += r?.simulated ?? 0;
  }
  return ok({ due: due.length, sent, simulated });
}

export const GET = handle;
export const POST = handle;
