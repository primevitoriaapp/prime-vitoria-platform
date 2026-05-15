import { db } from "../server/db";
import { resolveAdapter } from "../integrations/adapters";
import { enrichReceivableFromErpMappings } from "../integrations/map-receivable-for-erp";
import { isPostgresUniqueViolation } from "../server/postgres-errors";
import { fcmDataFromPayload, sendFcmLegacyDataMessage } from "../notifications/fcm-legacy";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NotificationProcessOptions = {
  limit?: number;
  tenantId?: string;
};

export async function processNotificationJobs(opts?: NotificationProcessOptions) {
  const limit = opts?.limit ?? 20;
  let query = db
    .from("notification_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (opts?.tenantId) {
    query = query.eq("tenant_id", opts.tenantId);
  }

  const { data: jobs } = await query;

  const fcmKey = process.env.FCM_SERVER_KEY?.trim();

  let processed = 0;
  for (const job of jobs ?? []) {
    const payload = (job.payload && typeof job.payload === "object" ? job.payload : {}) as Record<string, unknown>;
    const eventType = String(payload.eventType ?? "unknown");
    const channel = String(payload.channel ?? "push");
    const recipientType = String(payload.recipientType ?? "unknown");
    const recipientId = String(payload.recipientId ?? "");

    const now = new Date().toISOString();
    const attempts = (job.attempt_count ?? 0) + 1;

    const failJob = async (lastError: string, notifError: string) => {
      await db.from("notifications").insert({
        job_id: job.id,
        channel,
        recipient_type: recipientType,
        recipient_id: recipientId || "unknown",
        event_type: eventType,
        payload: job.payload,
        status: "failed",
        sent_at: null,
        error: notifError
      });
      await db
        .from("notification_jobs")
        .update({
          status: "error",
          last_error: lastError,
          attempt_count: attempts,
          updated_at: now
        })
        .eq("id", job.id);
      processed += 1;
    };

    const succeedJob = async () => {
      await db.from("notifications").insert({
        job_id: job.id,
        channel,
        recipient_type: recipientType,
        recipient_id: recipientId,
        event_type: eventType,
        payload: job.payload,
        status: "sent",
        sent_at: now,
        error: null
      });
      await db
        .from("notification_jobs")
        .update({ status: "success", last_error: null, attempt_count: attempts, updated_at: now })
        .eq("id", job.id);
      processed += 1;
    };

    if (!fcmKey) {
      await failJob("PUSH_PROVIDER_NOT_CONFIGURED", "FCM_SERVER_KEY nao definido");
      continue;
    }

    if (recipientType !== "driver" || !recipientId || !uuidRe.test(recipientId)) {
      await failJob("UNSUPPORTED_RECIPIENT", `Destinatario invalido: type=${recipientType} id=${recipientId}`);
      continue;
    }

    const jobTenantId = job.tenant_id as string | undefined;

    const tokenQuery = db.from("driver_push_tokens").select("token, tenant_id").eq("driver_id", recipientId);
    const { data: tokenRow, error: tokErr } = jobTenantId
      ? await tokenQuery.eq("tenant_id", jobTenantId).maybeSingle()
      : await tokenQuery.maybeSingle();

    if (tokErr) {
      await failJob(tokErr.message, tokErr.message);
      continue;
    }

    if (!tokenRow?.token?.trim()) {
      await failJob("NO_DEVICE_PUSH_TOKEN", "Motorista sem token FCM registado (POST /api/drivers/push-token)");
      continue;
    }

    const data = fcmDataFromPayload(payload);
    const send = await sendFcmLegacyDataMessage({
      serverKey: fcmKey,
      registrationToken: tokenRow.token.trim(),
      data
    });

    if (send.ok) {
      await succeedJob();
    } else {
      await failJob(send.reason, send.reason);
    }
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
    const jobTenantId = job.tenant_id as string | undefined;

    try {
      if (job.entity_type !== "receivable") {
        throw new Error(`Unsupported erp_sync entity_type: ${String(job.entity_type)}`);
      }

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

      const { data: tripRow } = await db.from("trips").select("tenant_id").eq("id", receivable.trip_id).maybeSingle();
      const tenantId = tripRow?.tenant_id;
      if (!tenantId) {
        await db
          .from("erp_sync_jobs")
          .update({ status: "error", last_error: "Trip tenant not found for receivable", response_snapshot: null })
          .eq("id", job.id);
        continue;
      }

      if (jobTenantId && tenantId !== jobTenantId) {
        await db
          .from("erp_sync_jobs")
          .update({
            status: "error",
            last_error: "Job tenant_id does not match trip tenant (data integrity)",
            response_snapshot: { job_tenant_id: jobTenantId, trip_tenant_id: tenantId }
          })
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
      const dto = await enrichReceivableFromErpMappings(db, provider, baseDto, tenantId);

      const result = await adapter.createReceivable(dto);

      const syncStatus =
        result.externalStatus === "mock" || result.externalId.includes("_mock_") ? "mock" : "success";

      const { error: mapErr } = await db.from("erp_entity_mappings").upsert(
        {
          tenant_id: tenantId,
          provider,
          entity_type: "receivable",
          internal_id: receivable.id,
          external_id: result.externalId,
          sync_status: syncStatus,
          last_sync_at: new Date().toISOString()
        },
        { onConflict: "tenant_id,provider,entity_type,internal_id" }
      );
      if (mapErr) {
        throw new Error(mapErr.message);
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

export type ReconciliationRunOptions = {
  /** Se definido, apenas mapeamentos deste tenant (utilizador ou `?tenant_id=` em job maquina). */
  tenantId?: string;
  limit?: number;
};

/**
 * Compara mapeamentos ERP de titulos com `accounts_receivable`; regista `missing_external` por tenant.
 */
export async function runReconciliation(opts?: ReconciliationRunOptions) {
  const limit = opts?.limit ?? 500;
  let query = db.from("erp_entity_mappings").select("*").eq("entity_type", "receivable").limit(limit);
  if (opts?.tenantId) {
    query = query.eq("tenant_id", opts.tenantId);
  }

  const { data: mappings, error: mapErr } = await query;
  if (mapErr) {
    throw new Error(mapErr.message);
  }

  let issues = 0;
  let scanned = 0;
  for (const mapping of mappings ?? []) {
    scanned += 1;
    const tenantId = mapping.tenant_id as string | undefined;
    if (!tenantId) {
      continue;
    }

    const { data: receivable } = await db
      .from("accounts_receivable")
      .select("id, status")
      .eq("id", mapping.internal_id)
      .maybeSingle();

    if (!receivable) {
      const { error: insErr } = await db.from("erp_reconciliation_issues").insert({
        tenant_id: tenantId,
        provider: mapping.provider,
        entity_type: "receivable",
        entity_id: mapping.internal_id,
        issue_type: "missing_external",
        details: { reason: "Internal receivable missing" }
      });
      if (!insErr) {
        issues += 1;
      } else if (!isPostgresUniqueViolation(insErr)) {
        throw new Error(insErr.message);
      }
    }
  }

  return { issues, scanned };
}
