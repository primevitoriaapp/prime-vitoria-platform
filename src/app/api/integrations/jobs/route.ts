import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";

const schema = z.object({
  provider: z.enum(["conta_azul", "omie"]),
  entity_type: z.enum(["receivable"]),
  entity_id: z.string().uuid(),
  direction: z.enum(["outbound", "inbound"]).default("outbound")
});

export async function POST(request: Request) {
  try {
    runIntegrationGuards(request, "jobs-post");
    const session = await getSessionContext();
    assertCapability(session, "erp.jobs.enqueue");

    const body = schema.parse(await request.json());

    const { data, error } = await db
      .from("erp_sync_jobs")
      .insert({
        provider: body.provider,
        direction: body.direction,
        entity_type: body.entity_type,
        entity_id: body.entity_id,
        status: "queued",
        payload_snapshot: { source: "api.integrations.jobs", requested_by: session.userId }
      })
      .select("id")
      .single();

    if (error) return fail("ERP_JOB_ENQUEUE_FAILED", error.message, 500);
    return ok({ job_id: data.id }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
    if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
    if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    return fail("INVALID_REQUEST", message, 400);
  }
}
