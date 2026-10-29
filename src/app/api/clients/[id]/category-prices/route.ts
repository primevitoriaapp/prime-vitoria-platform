import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { getClientCategoryPrices, saveClientCategoryPrices } from "@/lib/pricing/vehicle-categories";

const money = z.union([z.number(), z.string(), z.null()]).transform((v) => {
  if (v === null || v === "") return null;
  const t = String(v).trim();
  // "1.234,50" → 1234.5 ; "3,00" → 3 ; "3.5" → 3.5
  const n = typeof v === "number" ? v : Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
});

const rowSchema = z.object({
  category_id: z.string().uuid(),
  service: z.enum(["transfer", "diaria_5h", "diaria_10h", "diaria_12h", "km_b1", "km_b2", "hora_extra", "hora_parada"]),
  enabled: z.boolean(),
  client_price: money,
  partner_price: money
});

async function guard(id: string, write: boolean) {
  const session = await getSessionContext();
  const allowed = write ? ["admin", "operador"] : ["admin", "operador", "financeiro"];
  if (!allowed.includes(session.role)) return { denied: fail("FORBIDDEN", "Sem permissão", 403) } as const;
  const tenantId = assertTenantScope(session);
  const { data } = await db.from("clients").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!data) return { denied: fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404) } as const;
  return { tenantId } as const;
}

/** Tabela de preços da empresa por categoria × serviço (valores do cliente e do parceiro). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const g = await guard(id, false);
    if ("denied" in g) return g.denied;
    return ok(await getClientCategoryPrices(id));
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const g = await guard(id, true);
    if ("denied" in g) return g.denied;
    const parsed = z.array(rowSchema).max(1000).parse(await request.json());
    // Regra da Prime: só categoria marcada "cobra por km" pode ter km ligado.
    const { data: cats } = await db.from("vehicle_categories").select("id, allows_km").eq("tenant_id", g.tenantId);
    const kmOk = new Set((cats ?? []).filter((c) => c.allows_km).map((c) => c.id as string));
    const rows = parsed.map((r) =>
      (r.service === "km_b1" || r.service === "km_b2") && !kmOk.has(r.category_id) ? { ...r, enabled: false } : r
    );
    await saveClientCategoryPrices(g.tenantId, id, rows);
    return ok(await getClientCategoryPrices(id));
  } catch (error) {
    return mapApiError(error);
  }
}
