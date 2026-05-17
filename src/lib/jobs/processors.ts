import { db } from "../server/db";
import { resolveAdapter } from "../integrations/adapters";
import { enrichReceivableFromErpMappings } from "../integrations/map-receivable-for-erp";
import { parseWebhookPayload } from "../integrations/parse-webhook-payload";
import type { Provider } from "../integrations/types";
import { isPostgresUniqueViolation } from "../server/postgres-errors";
import { insertAuditEvent } from "../server/audit-log";
import { fcmDataFromPayload, sendFcmLegacyDataMessage } from "../notifications/fcm-legacy";
import { notificationFailureUpdate } from "../notifications/job-retry";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NotificationProcessOptions = {
  limit?: number;
  tenantId?: string;
};

export async function processNotificationJobs(opts?: NotificationProcessOptions) {
  const limit = opts?.limit ?? 20;
  const readyAt = new Date().toISOString();
  let query = db
    .from("notification_jobs")
    .select("*")
    .eq("status", "queued")
    .or(`next_retry_at.is.null,next_retry_at.lte.${readyAt}`)
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

    const nowDate = new Date();
    const now = nowDate.toISOString();
    const attempts = (job.attempt_count ?? 0) + 1;

    const jobTenantId = job.tenant_id as string | undefined;

    const failJob = async (lastError: string, notifError: string, opts?: { retryable?: boolean }) => {
      const failure = notificationFailureUpdate({
        attemptCountBefore: job.attempt_count,
        maxAttempts: job.max_attempts,
        now: nowDate,
        lastError,
        retryable: opts?.retryable
      });
      if (!jobTenantId) {
        await db
          .from("notification_jobs")
          .update({
            status: "error",
            last_error: "MISSING_TENANT_ID",
            attempt_count: attempts,
            next_retry_at: null,
            updated_at: now
          })
          .eq("id", job.id);
        processed += 1;
        return;
      }
      if (failure.status === "error") {
        await db.from("notifications").insert({
          tenant_id: jobTenantId,
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
      }
      await db
        .from("notification_jobs")
        .update({
          status: failure.status,
          last_error: failure.last_error,
          attempt_count: failure.attempt_count,
          next_retry_at: failure.next_retry_at,
          updated_at: now
        })
        .eq("id", job.id);
      processed += 1;
    };

    const succeedJob = async () => {
      if (!jobTenantId) {
        await db
          .from("notification_jobs")
          .update({
            status: "error",
            last_error: "MISSING_TENANT_ID",
            attempt_count: attempts,
            updated_at: now
          })
          .eq("id", job.id);
        processed += 1;
        return;
      }
      await db.from("notifications").insert({
        tenant_id: jobTenantId,
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
        .update({ status: "success", last_error: null, attempt_count: attempts, next_retry_at: null, updated_at: now })
        .eq("id", job.id);
      processed += 1;
    };

    if (channel === "in_app" && recipientType === "profile" && uuidRe.test(recipientId)) {
      await succeedJob();
      continue;
    }

    if (!fcmKey) {
      await failJob("PUSH_PROVIDER_NOT_CONFIGURED", "FCM_SERVER_KEY nao definido");
      continue;
    }

    if (recipientType !== "driver" || !recipientId || !uuidRe.test(recipientId)) {
      await failJob("UNSUPPORTED_RECIPIENT", `Destinatario invalido: type=${recipientType} id=${recipientId}`, {
        retryable: false
      });
      continue;
    }

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

export type ErpWebhookProcessOptions = {
  limit?: number;
  tenantId?: string;
};

/**
 * Processa entradas pendentes em `erp_webhook_inbox` (baixa de titulo, atualização de mapeamento).
 */
export async function processErpWebhookInbox(opts?: ErpWebhookProcessOptions) {
  const limit = opts?.limit ?? 30;
  let query = db
    .from("erp_webhook_inbox")
    .select("*")
    .eq("status", "pending")
    .order("received_at", { ascending: true })
    .limit(limit);

  if (opts?.tenantId) {
    query = query.eq("tenant_id", opts.tenantId);
  }

  const { data: rows, error: fetchErr } = await query;
  if (fetchErr) {
    throw new Error(fetchErr.message);
  }

  let processed = 0;
  let ignored = 0;
  let errors = 0;

  for (const row of rows ?? []) {
    const now = new Date().toISOString();
    const attempts = (row.attempt_count ?? 0) + 1;
    const inboxId = row.id as string;
    const tenantId = (row.tenant_id as string | null) ?? null;
    const provider = row.provider as Provider | "generic";
    const payload = row.payload;

    const finish = async (status: "processed" | "ignored" | "error", lastError: string | null) => {
      await db
        .from("erp_webhook_inbox")
        .update({
          status,
          processed_at: now,
          last_error: lastError,
          attempt_count: attempts
        })
        .eq("id", inboxId);
      if (status === "processed") processed += 1;
      else if (status === "ignored") ignored += 1;
      else errors += 1;
    };

    try {
      const parsed = parseWebhookPayload(provider, payload);

      if (parsed.kind === "unknown") {
        await finish("ignored", null);
        continue;
      }

      let receivableId = parsed.receivableInternalId;
      if (!receivableId && parsed.externalId && provider !== "generic") {
        let mapQuery = db
          .from("erp_entity_mappings")
          .select("internal_id, tenant_id")
          .eq("provider", provider)
          .eq("entity_type", "receivable")
          .eq("external_id", parsed.externalId)
          .limit(1);
        if (tenantId) {
          mapQuery = mapQuery.eq("tenant_id", tenantId);
        }
        const { data: mapping } = await mapQuery.maybeSingle();
        receivableId = mapping?.internal_id as string | undefined;
      }

      if (!receivableId) {
        await finish("ignored", "Nenhum titulo interno identificado no payload");
        continue;
      }

      const { data: receivable } = await db
        .from("accounts_receivable")
        .select("id, trip_id, status")
        .eq("id", receivableId)
        .maybeSingle();

      if (!receivable) {
        await finish("error", "Receivable not found");
        continue;
      }

      const { data: tripRow } = await db.from("trips").select("tenant_id").eq("id", receivable.trip_id).maybeSingle();
      const tripTenantId = tripRow?.tenant_id as string | undefined;
      if (!tripTenantId) {
        await finish("error", "Trip tenant not found");
        continue;
      }
      if (tenantId && tripTenantId !== tenantId) {
        await finish("error", "tenant_id do webhook não confere com a corrida");
        continue;
      }

      const effectiveTenantId = tenantId ?? tripTenantId;

      if (receivable.status === "cancelled") {
        await finish("ignored", "Titulo cancelado");
        continue;
      }

      if (parsed.kind === "receivable_paid" && receivable.status !== "paid") {
        const { error: payErr } = await db
          .from("accounts_receivable")
          .update({
            status: "paid",
            paid_at: now,
            payment_method: `erp_webhook:${provider}`
          })
          .eq("id", receivableId);
        if (payErr) {
          await finish("error", payErr.message);
          continue;
        }

        if (provider !== "generic") {
          await db
            .from("erp_entity_mappings")
            .update({
              sync_status: "paid",
              last_sync_at: now
            })
            .eq("tenant_id", effectiveTenantId)
            .eq("provider", provider)
            .eq("entity_type", "receivable")
            .eq("internal_id", receivableId);
        }

        await insertAuditEvent({
          tenantId: effectiveTenantId,
          actorUserId: null,
          action: `erp.webhook.${provider}.receivable_paid`,
          entityType: "accounts_receivable",
          entityId: receivableId,
          metadata: {
            inbox_id: inboxId,
            event: parsed.eventLabel,
            external_id: parsed.externalId
          }
        });
      }

      await finish("processed", null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finish("error", message);
    }
  }

  return { processed, ignored, errors, scanned: (rows ?? []).length };
}
