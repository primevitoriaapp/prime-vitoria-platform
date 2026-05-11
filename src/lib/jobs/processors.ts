import { db } from "../server/db";
import { resolveAdapter } from "../integrations/adapters";
import { enrichReceivableFromErpMappings } from "../integrations/map-receivable-for-erp";

export async function processNotificationJobs(limit = 20) {
  const { data: jobs } = await db
    .from("notification_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const job of jobs ?? []) {
    const eventType = String(job.payload?.eventType ?? "unknown");
    const channel = String(job.payload?.channel ?? "push");
    const recipientType = String(job.payload?.recipientType ?? "unknown");
    const recipientId = String(job.payload?.recipientId ?? "unknown");

    await db.from("notifications").insert({
      job_id: job.id,
      channel,
      recipient_type: recipientType,
      recipient_id: recipientId,
      event_type: eventType,
      payload: job.payload,
      status: "sent",
      sent_at: new Date().toISOString()
    });

    await db.from("notification_jobs").update({ status: "success", updated_at: new Date().toISOString() }).eq("id", job.id);
    processed += 1;
  }

  return { processed };
}

export async function processErpSyncJobs(limit = 20) {
  const { data: jobs } = await db
    .from("erp_sync_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const job of jobs ?? []) {
    const provider = job.provider as "conta_azul" | "omie";
    const adapter = resolveAdapter(provider);

    try {
      if (job.entity_type === "receivable") {
        const { data: receivable } = await db
          .from("accounts_receivable")
          .select("id, trip_id, client_id, amount, due_date")
          .eq("id", job.entity_id)
          .single();

        if (!receivable) {
          await db
            .from("erp_sync_jobs")
            .update({ status: "error", last_error: "Receivable not found", response_snapshot: null })
            .eq("id", job.id);
          continue;
        }

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

        await db.from("erp_entity_mappings").upsert({
          provider,
          entity_type: "receivable",
          internal_id: receivable.id,
          external_id: result.externalId,
          sync_status: syncStatus,
          last_sync_at: new Date().toISOString()
        });
      }

      await db
        .from("erp_sync_jobs")
        .update({ status: "success", last_error: null, response_snapshot: { done: true } })
        .eq("id", job.id);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from("erp_sync_jobs")
        .update({
          status: "error",
          last_error: message,
          attempt_count: (job.attempt_count ?? 0) + 1,
          response_snapshot: { error: message }
        })
        .eq("id", job.id);
    }
  }

  return { processed };
}

export async function runReconciliation() {
  const { data: mappings } = await db
    .from("erp_entity_mappings")
    .select("*")
    .eq("entity_type", "receivable")
    .limit(500);

  let issues = 0;
  for (const mapping of mappings ?? []) {
    const { data: receivable } = await db.from("accounts_receivable").select("id, status").eq("id", mapping.internal_id).single();
    if (!receivable) {
      await db.from("erp_reconciliation_issues").insert({
        provider: mapping.provider,
        entity_type: "receivable",
        entity_id: mapping.internal_id,
        issue_type: "missing_external",
        details: { reason: "Internal receivable missing" }
      });
      issues += 1;
    }
  }

  return { issues };
}
