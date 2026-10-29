import { db } from "@/lib/server/db";
import { CATEGORY_SERVICES, enabledModes, type CategoryKind, type CategoryService, type PriceCell, type ServiceMode } from "@/lib/pricing/category-catalog";

export type VehicleCategory = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  passengers: number;
  kind: CategoryKind;
  photo_path: string | null;
  sort: number;
  active: boolean;
  allows_km?: boolean;
};

export async function listVehicleCategories(tenantId: string, includeInactive = false): Promise<VehicleCategory[]> {
  let q = db.from("vehicle_categories").select("*").eq("tenant_id", tenantId).order("sort").order("name");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as VehicleCategory[];
}

export async function getVehicleCategory(tenantId: string, id: string): Promise<VehicleCategory | null> {
  const { data } = await db.from("vehicle_categories").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return (data as VehicleCategory | null) ?? null;
}

export function categoryPhotoUrl(c: Pick<VehicleCategory, "id" | "photo_path">): string | null {
  return c.photo_path ? `/api/public/category-photo/${c.id}?v=${encodeURIComponent(c.photo_path.slice(-12))}` : null;
}

export type ClientPriceRow = PriceCell & { category_id: string };

export async function getClientCategoryPrices(clientId: string): Promise<ClientPriceRow[]> {
  const { data, error } = await db
    .from("client_category_prices")
    .select("category_id, service, enabled, client_price, partner_price")
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    category_id: r.category_id as string,
    service: r.service as CategoryService,
    enabled: Boolean(r.enabled),
    client_price: r.client_price == null ? null : Number(r.client_price),
    partner_price: r.partner_price == null ? null : Number(r.partner_price)
  }));
}

export async function saveClientCategoryPrices(tenantId: string, clientId: string, rows: ClientPriceRow[]) {
  const valid = new Set(CATEGORY_SERVICES.map((s) => s.id));
  const payload = rows
    .filter((r) => valid.has(r.service))
    .map((r) => ({
      tenant_id: tenantId,
      client_id: clientId,
      category_id: r.category_id,
      service: r.service,
      enabled: r.enabled,
      client_price: r.client_price,
      partner_price: r.partner_price,
      updated_at: new Date().toISOString()
    }));
  if (payload.length === 0) return;
  const { error } = await db.from("client_category_prices").upsert(payload, { onConflict: "client_id,category_id,service" });
  if (error) throw new Error(error.message);
}

export type ClientCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  passengers: number;
  kind: CategoryKind;
  photo_url: string | null;
  modes: ServiceMode[];
  /** Só o preço do km (para estimar o corporativo); transfer/diária ficam "a combinar" no portal. */
  km_price: { b1: number | null; b2: number | null } | null;
};

/** O que a empresa pode pedir no portal: categorias com pelo menos um serviço ligado. */
export async function loadClientCatalog(tenantId: string, clientId: string): Promise<ClientCatalogItem[]> {
  const [categories, prices] = await Promise.all([listVehicleCategories(tenantId), getClientCategoryPrices(clientId)]);
  const out: ClientCatalogItem[] = [];
  for (const c of categories) {
    const cells = prices.filter((p) => p.category_id === c.id);
    const modes = enabledModes(cells);
    if (modes.length === 0) continue;
    const b1 = cells.find((p) => p.service === "km_b1" && p.enabled)?.client_price ?? null;
    const b2 = cells.find((p) => p.service === "km_b2" && p.enabled)?.client_price ?? null;
    out.push({
      id: c.id,
      name: c.name,
      description: c.description,
      passengers: c.passengers,
      kind: c.kind,
      photo_url: categoryPhotoUrl(c),
      modes,
      km_price: modes.includes("km") ? { b1, b2 } : null
    });
  }
  return out;
}
