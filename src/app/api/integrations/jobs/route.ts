import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";
import { getReceivableTripTenantId } from "@/lib/integrations/erp-sync-job-scope";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";

const postSchema = z.object({
  provider: z.enum(["conta_azul", "omie"]),
  entity_type: z.enum(["receivable"]),
  entity_id: z.string().uuid(),
  direction: z.enum(["outbound", "inbound"]).default("outbound")
});

const listSchema = z.object({
  status: z.enum(["queued", "success", "error"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

function mapIntegrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
  if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
  if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
  return fail("INVALID_REQUEST", message, 400);
}

/**
 * Lista trabalhos de sincronizacao ERP da organizacao (tenant da sessao).
 */
export async function GET(request: Request) {
  try {
    runIntegrationGuards(request, "jobs-get");
    const session = await getSessionContext();
    assertCapability(session, "erp.jobs.enqueue");
    const tenantId = assertTenantScope(session);

    const q = listSchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    let query = db
      .from("erp_sync_jobs")
      .select("id, provider, direction, entity_type, entity_id, status, attempt_count, last_error, created_at", {
        count: "exact"
      })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q.status) {
      query = query.eq("status", q.status);
    }

    const { data, error, count } = await query;
    if (error) return fail("ERP_JOBS_LIST_FAILED", error.message, 500);

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
 * Enfileira sincronizacao ERP (titulo a receber -> adapter).
 * Valida tenant do titulo vs sessao; evita duplicados `queued` (indice unico parcial + fallback).
 */
export async function POST(request: Request) {
  try {
    runIntegrationGuards(request, "jobs-post");
    const session = await getSessionContext();
    assertCapability(session, "erp.jobs.enqueue");
    const tenantId = assertTenantScope(session);

    const body = postSchema.parse(await request.json());

    if (body.entity_type === "receivable") {
      const receivableTenantId = await getReceivableTripTenantId(db, body.entity_id);
      if (!receivableTenantId) {
        return fail("RECEIVABLE_NOT_FOUND", "Titulo ou corrida nao encontrado", 404);
      }
      if (receivableTenantId !== tenantId) {
        return fail("FORBIDDEN", "Titulo nao pertence a esta organizacao", 403);
      }
    }

    const { data, error } = await db
      .from("erp_sync_jobs")
      .insert({
        tenant_id: tenantId,
        provider: body.provider,
        direction: body.direction,
        entity_type: body.entity_type,
        entity_id: body.entity_id,
        status: "queued",
        payload_snapshot: { source: "api.integrations.jobs", requested_by: session.userId }
      })
      .select("id")
      .single();

    if (error) {
      if (isPostgresUniqueViolation(error)) {
        const { data: existing, error: selErr } = await db
          .from("erp_sync_jobs")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("provider", body.provider)
          .eq("entity_type", body.entity_type)
          .eq("entity_id", body.entity_id)
          .eq("status", "queued")
          .maybeSingle();

        if (selErr || !existing) {
          return fail("ERP_JOB_ENQUEUE_FAILED", selErr?.message ?? "Duplicate job but row not found", 409);
        }
        return ok({ job_id: existing.id, deduplicated: true }, 200);
      }
      return fail("ERP_JOB_ENQUEUE_FAILED", error.message, 500);
    }

    if (!data?.id) return fail("ERP_JOB_ENQUEUE_FAILED", "Missing job id after insert", 500);
    return ok({ job_id: data.id }, 201);
  } catch (error) {
    return mapIntegrationError(error);
  }
}
