import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { rowsToCsv } from "@/lib/reports/csv";
import { operationsTripsReportHtml } from "@/lib/reports/operations-trips-html";

const querySchema = z.object({
  format: z.enum(["json", "csv", "html"]).default("json"),
  scheduledFrom: z.string().optional(),
  scheduledTo: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200)
});

/** Relatório operacional de viagens (JSON ou CSV). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "report.read");
    const tenantId = assertTenantScope(session);
    const q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));

    let scheduledFromIso: string | null = null;
    let scheduledToIso: string | null = null;
    if (q.scheduledFrom?.trim()) {
      const t = new Date(q.scheduledFrom.trim());
      if (Number.isNaN(t.getTime())) return fail("INVALID_QUERY", "scheduledFrom inválido", 400);
      scheduledFromIso = t.toISOString();
    }
    if (q.scheduledTo?.trim()) {
      const t = new Date(q.scheduledTo.trim());
      if (Number.isNaN(t.getTime())) return fail("INVALID_QUERY", "scheduledTo inválido", 400);
      scheduledToIso = t.toISOString();
    }

    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    let query = db
      .from("trips")
      .select(
        "id, scheduled_at, operational_status, client_id, driver_id, origin_text, destination_text, passenger_name, planned_km, actual_km, dispatch_mode",
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .order("scheduled_at", { ascending: false })
      .range(from, to);

    if (scheduledFromIso) query = query.gte("scheduled_at", scheduledFromIso);
    if (scheduledToIso) query = query.lte("scheduled_at", scheduledToIso);
    if (q.status) query = query.eq("operational_status", q.status);

    const { data, error, count } = await query;
    if (error) return fail("REPORT_TRIPS_FAILED", error.message, 500);

    const items = data ?? [];

    if (q.format === "html") {
      const html = operationsTripsReportHtml(items, new Date());
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="operacoes-viagens-${new Date().toISOString().slice(0, 10)}.html"`
        }
      });
    }

    if (q.format === "csv") {
      const csv = rowsToCsv(
        [
          "id",
          "scheduled_at",
          "operational_status",
          "client_id",
          "driver_id",
          "origin",
          "destination",
          "passenger",
          "planned_km",
          "actual_km",
          "dispatch_mode"
        ],
        items.map((t) => [
          t.id,
          t.scheduled_at,
          t.operational_status,
          t.client_id,
          t.driver_id ?? "",
          t.origin_text,
          t.destination_text,
          t.passenger_name ?? "",
          t.planned_km ?? "",
          t.actual_km ?? "",
          t.dispatch_mode
        ])
      );
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="operacoes-viagens-${new Date().toISOString().slice(0, 10)}.csv"`
        }
      });
    }

    return ok({
      items,
      page: q.page,
      pageSize: q.pageSize,
      total: count ?? 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Forbidden:")) {
      return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    }
    return fail("INVALID_REQUEST", message, 400);
  }
}
