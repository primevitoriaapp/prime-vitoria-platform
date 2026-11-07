import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { birthdayStatus, docAlert, docAlertText } from "@/lib/drivers/driver-dates";

/** App do motorista: parabéns (hoje/ontem) e documentos perto de vencer. */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "motorista" || !session.driverId) return fail("FORBIDDEN", "Só motorista", 403);
    const { data: d } = await db.from("drivers").select("full_name, birth_date, cnh_expires_at, cnh_expiry").eq("id", session.driverId).maybeSingle();
    const { data: links } = await db.from("driver_vehicle_links").select("vehicle_id").eq("driver_id", session.driverId).eq("active", true).is("end_at", null);
    const vIds = (links ?? []).map((l) => l.vehicle_id as string);
    const { data: vehicles } = vIds.length ? await db.from("vehicles").select("plate, insurance_expires_at, licensing_expires_at").in("id", vIds) : { data: [] };
    const alerts: { level: string; text: string }[] = [];
    const cnh = docAlert("CNH", (d?.cnh_expires_at ?? d?.cnh_expiry ?? null) as string | null);
    if (cnh) alerts.push({ level: cnh.level, text: docAlertText(cnh) });
    for (const v of vehicles ?? []) {
      const s = docAlert("Seguro", v.insurance_expires_at as string | null);
      if (s) alerts.push({ level: s.level, text: `${docAlertText(s)} · ${v.plate ?? ""}`.trim() });
      const l = docAlert("Licenciamento", v.licensing_expires_at as string | null);
      if (l) alerts.push({ level: l.level, text: `${docAlertText(l)} · ${v.plate ?? ""}`.trim() });
    }
    const st = birthdayStatus(d?.birth_date as string | null);
    return ok({
      first_name: String(d?.full_name ?? "").split(" ")[0] || "motorista",
      birthday: st === "today" || st === "yesterday" ? st : null,
      alerts
    });
  } catch (e) {
    return mapApiError(e);
  }
}
