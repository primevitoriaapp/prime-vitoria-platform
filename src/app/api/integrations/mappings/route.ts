import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import type { Provider } from "@/lib/integrations/types";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";

const postSchema = z.object({
  provider: z.enum(["conta_azul", "omie"]),
  entity_type: z.enum(["client", "conta_azul_item"]),
  internal_id: z.string().uuid(),
  external_id: z.string().min(1).max(200)
});

const listSchema = z.object({
  provider: z.enum(["conta_azul", "omie"]).optional(),
  entity_type: z.string().optional(),
  internal_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

function mapIntegrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Integration access denied")) {
    return fail("FORBIDDEN_IP", message, 403);
  }
  if (message.includes("Rate limit exceeded")) {
    return fail("RATE_LIMIT", message, 429);
  }
  if (message.startsWith("Forbidden:")) {
    return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
  }
  return fail("INVALID_REQUEST", message, 400);
}

/**
 * Lista mapeamentos internos -> ERP (filtros opcionais).
 * Autenticacao: `Authorization: Bearer` (JWT Supabase) ou fallback `x-role` / `x-user-id` (dev).
 */
export async function GET(request: Request) {
  try {
    runIntegrationGuards(request, "mappings-get");
    const session = await getSessionContext();
    assertCapability(session, "erp.mapping.read");
    const tenantId = assertTenantScope(session);

    const q = listSchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    let query = db
      .from("erp_entity_mappings")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("last_sync_at", { ascending: false })
      .range(from, to);

    if (q.provider) query = query.eq("provider", q.provider);
    if (q.entity_type) query = query.eq("entity_type", q.entity_type);
    if (q.internal_id) query = query.eq("internal_id", q.internal_id);

    const { data, error, count } = await query;

    if (error) return fail("MAPPING_LIST_FAILED", error.message, 500);

    return ok({
      items: data ?? [],
      page: q.page,
      pageSize: q.pageSize,
      total: count ?? 0
    });
  } catch (error) {
    return mapIntegrationError(error);
  }
}

/**
 * Cadastra ou atualiza mapeamento interno -> ERP.
 * Requer papel com `erp.mapping.write` (admin / operador) via JWT ou `x-role`.
 */
export async function POST(request: Request) {
  try {
    runIntegrationGuards(request, "mappings-post");
    const session = await getSessionContext();
    assertCapability(session, "erp.mapping.write");
    const tenantId = assertTenantScope(session);

    const body = postSchema.parse(await request.json());

    if (body.entity_type === "conta_azul_item" && body.provider !== "conta_azul") {
      return fail("INVALID_ENTITY", "conta_azul_item is only valid for provider conta_azul", 400);
    }

    const { data, error } = await db
      .from("erp_entity_mappings")
      .upsert(
        {
          tenant_id: tenantId,
          provider: body.provider as Provider,
          entity_type: body.entity_type,
          internal_id: body.internal_id,
          external_id: body.external_id,
          sync_status: "mapped",
          last_sync_at: new Date().toISOString()
        },
        { onConflict: "tenant_id,provider,entity_type,internal_id" }
      )
      .select("*")
      .single();

    if (error) return fail("MAPPING_UPSERT_FAILED", error.message, 500);
    return ok(data, 201);
  } catch (error) {
    return mapIntegrationError(error);
  }
}
