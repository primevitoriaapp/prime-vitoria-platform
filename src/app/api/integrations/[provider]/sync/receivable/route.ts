import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { Provider, resolveAdapter } from "@/lib/integrations/adapters";
import { erpIntegrationMode } from "@/lib/integrations/erp-mode";
import { enrichReceivableFromErpMappings } from "@/lib/integrations/map-receivable-for-erp";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";

const schema = z.object({
  receivable_id: z.string().uuid()
});

export async function POST(request: Request, { params }: { params: Promise<{ provider: Provider }> }) {
  try {
    runIntegrationGuards(request, "sync-receivable-post");
    const session = await getSessionContext();
    assertCapability(session, "erp.mapping.write");

    const body = schema.parse(await request.json());
    const { provider } = await params;

    const adapter = resolveAdapter(provider);
    const mode = erpIntegrationMode(provider);

    const { data: receivable } = await db
      .from("accounts_receivable")
      .select("id, trip_id, client_id, amount, due_date")
      .eq("id", body.receivable_id)
      .single();

    if (!receivable) return fail("RECEIVABLE_NOT_FOUND", "Receivable not found", 404);

    const baseDto = {
      internalId: receivable.id,
      tripId: receivable.trip_id,
      clientInternalId: receivable.client_id,
      amount: receivable.amount,
      dueDate: receivable.due_date,
      description: `Corrida ${receivable.trip_id}`,
      externalReference: receivable.trip_id
    };
    const dto = await enrichReceivableFromErpMappings(db, provider, baseDto);

    const result = await adapter.createReceivable(dto);

    const syncStatus =
      result.externalStatus === "mock" || result.externalId.includes("_mock_") ? "mock" : "success";

    const { error } = await db.from("erp_entity_mappings").upsert({
      provider,
      entity_type: "receivable",
      internal_id: receivable.id,
      external_id: result.externalId,
      sync_status: mode === "live" ? syncStatus : "mock",
      last_sync_at: new Date().toISOString()
    });

    if (error) return fail("ERP_SYNC_SAVE_FAILED", error.message, 500);

    return ok({ provider, mode, receivable_id: receivable.id, external_id: result.externalId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
    if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
    if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    return fail("ERP_SYNC_FAILED", message, 502);
  }
}
