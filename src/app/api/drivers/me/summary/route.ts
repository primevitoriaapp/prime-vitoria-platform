import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";

const ymdSp = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/**
 * Resumo do próprio motorista para o app: feitas hoje, números do mês,
 * nota média e as avaliações por corrida (só as dele). Nunca traz valores.
 */
export async function GET() {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    if (session.role !== "motorista" || !session.driverId) return fail("FORBIDDEN", "Só motorista", 403);
    const tenantId = assertTenantScope(session);
    const driverId = session.driverId;
    const now = new Date();
    const today = ymdSp(now);
    const since = new Date(now.getTime() - 120 * 86400000).toISOString();

    const [{ data: trips }, { data: ratings }, { data: drv }, profile] = await Promise.all([
      db
        .from("trips")
        .select("id, scheduled_at, actual_km, planned_km")
        .eq("tenant_id", tenantId)
        .eq("driver_id", driverId)
        .eq("operational_status", "completed")
        .gte("scheduled_at", since)
        .limit(2000),
      db.from("trip_ratings").select("trip_id, stars, comment, created_at").eq("driver_id", driverId).order("created_at", { ascending: false }).limit(400),
      db.from("drivers").select("created_at").eq("id", driverId).maybeSingle(),
      getTenantCompanyProfile(tenantId).catch(() => null)
    ]);

    const list = trips ?? [];
    const months: Record<string, { trips: number; km: number }> = {};
    let doneToday = 0;
    for (const t of list) {
      const day = ymdSp(new Date(t.scheduled_at as string));
      if (day === today) doneToday += 1;
      const m = day.slice(0, 7);
      const s = (months[m] ??= { trips: 0, km: 0 });
      s.trips += 1;
      s.km += Number(t.actual_km ?? t.planned_km ?? 0) || 0;
    }
    for (const m of Object.keys(months)) months[m]!.km = Math.round(months[m]!.km);

    const all = ratings ?? [];
    const avg = all.length ? Math.round((all.reduce((n, r) => n + Number(r.stars), 0) / all.length) * 10) / 10 : null;
    const byTrip: Record<string, { stars: number; comment: string | null }> = {};
    const ratingMonths: Record<string, { sum: number; n: number }> = {};
    for (const r of all) {
      if (r.trip_id && !byTrip[r.trip_id as string]) byTrip[r.trip_id as string] = { stars: Number(r.stars), comment: (r.comment as string | null) ?? null };
      const m = ymdSp(new Date(r.created_at as string)).slice(0, 7);
      const s = (ratingMonths[m] ??= { sum: 0, n: 0 });
      s.sum += Number(r.stars);
      s.n += 1;
    }
    const monthRating: Record<string, number> = {};
    for (const [m, s] of Object.entries(ratingMonths)) monthRating[m] = Math.round((s.sum / s.n) * 10) / 10;

    const central = (profile?.whatsapp || profile?.phone || "").replace(/\D/g, "") || null;

    return ok({
      today,
      done_today: doneToday,
      months,
      rating: avg,
      ratings_count: all.length,
      month_rating: monthRating,
      ratings_by_trip: byTrip,
      since: (drv?.created_at as string | null) ?? null,
      central_phone: central
    });
  } catch (e) {
    return mapApiError(e);
  }
}
