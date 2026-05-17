import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { calculateNetMargin } from "@/lib/finance/margin";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { driverPayableDueDate } from "@/lib/finance/driver-payable-forecast";
import { financialTitleBlocksRegeneration, financialTitleStatusLabel } from "@/lib/finance/financial-regeneration";

const schema = z.object({
  amount_client: z.number().nonnegative(),
  amount_driver: z.number().nonnegative(),
  tolls: z.number().nonnegative().default(0),
  parking: z.number().nonnegative().default(0),
  extras: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0)
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");

    const { id } = await params;
    const body = schema.parse(await request.json());

    const netMargin = calculateNetMargin(body);
    const tenantId = assertTenantScope(session);

    const { data: trip } = await db
      .from("trips")
      .select("id, client_id, driver_id, tenant_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();
    if (!trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, {
        client_id: trip.client_id,
        driver_id: trip.driver_id ?? null,
        tenant_id: trip.tenant_id
      })
    );
    if (denied) return denied;

    const [existingReceivableResult, existingPayableResult] = await Promise.all([
      db.from("accounts_receivable").select("id, status").eq("trip_id", id).eq("tenant_id", tenantId).maybeSingle(),
      trip.driver_id
        ? db
            .from("driver_payables")
            .select("id, status")
            .eq("trip_id", id)
            .eq("tenant_id", tenantId)
            .eq("driver_id", trip.driver_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);
    if (existingReceivableResult.error) {
      return fail("RECEIVABLE_LOAD_FAILED", existingReceivableResult.error.message, 500);
    }
    if (existingPayableResult.error) {
      return fail("PAYABLE_LOAD_FAILED", existingPayableResult.error.message, 500);
    }

    const existingReceivable = existingReceivableResult.data;
    if (financialTitleBlocksRegeneration(existingReceivable?.status as string | null | undefined)) {
      return fail(
        "RECEIVABLE_STATUS_LOCKED",
        `Conta a receber já está ${financialTitleStatusLabel(existingReceivable?.status as string | null | undefined)}; reabra antes de regenerar`,
        409
      );
    }

    const existingPayable = existingPayableResult.data;
    if (financialTitleBlocksRegeneration(existingPayable?.status as string | null | undefined)) {
      return fail(
        "PAYABLE_STATUS_LOCKED",
        `Pagável do motorista já está ${financialTitleStatusLabel(existingPayable?.status as string | null | undefined)}; reabra antes de regenerar`,
        409
      );
    }

    const { error: financialError } = await db.from("trip_financials").upsert(
      {
        trip_id: id,
        ...body,
        net_margin: netMargin
      },
      { onConflict: "trip_id" }
    );

    if (financialError) {
      if (isPostgresUniqueViolation(financialError)) {
        return fail("FINANCIAL_CONFLICT", "Dados financeiros em conflito com registro existente", 409);
      }
      return fail("FINANCIAL_SAVE_FAILED", financialError.message, 500);
    }

    const dueDate = driverPayableDueDate();

    const { error: arError } = await db.from("accounts_receivable").upsert(
      {
        trip_id: id,
        tenant_id: trip.tenant_id,
        client_id: trip.client_id,
        amount: body.amount_client,
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: dueDate,
        status: "open"
      },
      { onConflict: "trip_id" }
    );

    if (arError) {
      await db.from("trip_financials").delete().eq("trip_id", id);
      if (isPostgresUniqueViolation(arError)) {
        return fail("RECEIVABLE_CONFLICT", "Conta a receber em conflito", 409);
      }
      return fail("ACCOUNTS_RECEIVABLE_SAVE_FAILED", arError.message, 500);
    }

    if (trip.driver_id) {
      const { error: dpError } = await db.from("driver_payables").upsert(
        {
          trip_id: id,
          tenant_id: trip.tenant_id,
          driver_id: trip.driver_id,
          amount: body.amount_driver,
          due_date: dueDate,
          status: "open"
        },
        { onConflict: "trip_id,driver_id" }
      );

      if (dpError) {
        await db.from("accounts_receivable").delete().eq("trip_id", id);
        await db.from("trip_financials").delete().eq("trip_id", id);
        if (isPostgresUniqueViolation(dpError)) {
          return fail("PAYABLE_CONFLICT", "Pagavel ao motorista em conflito", 409);
        }
        return fail("DRIVER_PAYABLE_SAVE_FAILED", dpError.message, 500);
      }
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.trip_generate",
      entityType: "trip",
      entityId: id,
      metadata: { net_margin: netMargin, amount_client: body.amount_client, amount_driver: body.amount_driver },
      request
    });

    return ok({ trip_id: id, net_margin: netMargin });
  } catch (error) {
    return mapApiError(error);
  }
}
