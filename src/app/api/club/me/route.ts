import { db } from "@/lib/server/db";
import { mapApiError, ok } from "@/lib/server/http";
import { benefitIsValid, partnerIsLive } from "@/lib/club/club";
import { clubDriver, memberNumber } from "@/lib/club/driver-session";
import { resolveDriverPhotoDisplayUrl } from "@/lib/storage/driver-photo-upload";

export const dynamic = "force-dynamic";

/** Tudo que o app do motorista precisa para a área Prime Club. */
export async function GET() {
  try {
    const { driver, denied } = await clubDriver();
    if (denied || !driver) return denied as Response;
    const t = driver.tenantId;
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const [cats, partners, branches, benefits, favs, uses] = await Promise.all([
      db.from("club_categories").select("id, name, icon, position").eq("tenant_id", t).eq("active", true).order("position"),
      db.from("club_partners").select("id, name, category_id, description, logo_url, cover_url, phone, whatsapp, website, instagram, status, publish_at, featured").eq("tenant_id", t).eq("status", "publicado"),
      db.from("club_branches").select("id, partner_id, name, address, city, uf, lat, lng, hours, phone, whatsapp").eq("tenant_id", t).eq("active", true),
      db
        .from("club_benefits")
        .select("id, partner_id, branch_ids, title, description, kind, value, coupon_code, external_url, rules, valid_from, valid_until, max_uses_per_driver, max_uses_per_month, featured, active")
        .eq("tenant_id", t)
        .eq("active", true),
      db.from("club_favorites").select("partner_id").eq("driver_id", driver.id),
      db
        .from("club_redemptions")
        .select("id, created_at, partner_id, benefit_id, purchase_amount, saved_amount, status, rating")
        .eq("tenant_id", t)
        .eq("driver_id", driver.id)
        .order("created_at", { ascending: false })
        .limit(100)
    ]);
    const live = (partners.data ?? []).filter((p) => partnerIsLive(p as { status: string; publish_at: string | null }));
    const liveIds = new Set(live.map((p) => p.id));
    const validBenefits = (benefits.data ?? []).filter((b) => liveIds.has(b.partner_id) && benefitIsValid(b as { active: boolean; valid_from: string | null; valid_until: string | null }, today));
    const partnerName = new Map((partners.data ?? []).map((p) => [p.id, p.name]));
    const history = (uses.data ?? []).map((u) => ({ ...u, partner: partnerName.get(u.partner_id) ?? "Estabelecimento" }));
    const saved = history.filter((u) => u.status === "registrado").reduce((a, u) => a + Number(u.saved_amount ?? 0), 0);
    const month = today.slice(0, 7);
    const savedMonth = history.filter((u) => u.status === "registrado" && String(u.created_at).slice(0, 7) === month).reduce((a, u) => a + Number(u.saved_amount ?? 0), 0);
    return ok({
      member: {
        name: driver.profile_name?.trim() || driver.full_name,
        full_name: driver.full_name,
        photo_url: await resolveDriverPhotoDisplayUrl(driver.photo_url),
        number: memberNumber(driver.id),
        eligible: driver.eligible,
        reason: driver.reason
      },
      categories: cats.data ?? [],
      partners: live.map((p) => ({
        ...p,
        branches: (branches.data ?? []).filter((b) => b.partner_id === p.id),
        benefits: validBenefits.filter((b) => b.partner_id === p.id)
      })),
      favorites: (favs.data ?? []).map((f) => f.partner_id),
      history,
      saved_total: Math.round(saved * 100) / 100,
      saved_month: Math.round(savedMonth * 100) / 100
    });
  } catch (e) {
    return mapApiError(e);
  }
}
