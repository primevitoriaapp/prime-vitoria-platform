import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { assertCapability, can } from "@/lib/security/rbac";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enrichTripItemsWithVehicles } from "@/lib/trips/enrich-trip-vehicles";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  driverId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  scheduledFrom: z.string().optional(),
  scheduledTo: z.string().optional()
});

const createTripSchema = z.object({
  client_id: z.string().uuid(),
  requester_id: z.string().uuid().optional(),
  cost_center_id: z.string().uuid().optional(),
  service_type: z.string().min(2),
  scheduled_at: z.string(),
  origin_text: z.string().min(3),
  destination_text: z.string().min(3),
  dispatch_mode: z.enum(["directed", "offer"]).default("directed"),
  passenger_name: z.string().optional(),
  passenger_phone: z.string().optional(),
  notes: z.string().optional()
});

function mapTripError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Forbidden:")) {
    return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
  }
  return fail("INVALID_REQUEST", message, 400);
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    enforceRateLimit(`trip:create:${ip}`, 60, 60_000);
    const session = await getSessionContext();
    assertCapability(session, session.role === "cliente" ? "trip.request" : "trip.write");

    const body = createTripSchema.parse(await request.json());
    const tenantId = assertTenantScope(session);

    if (session.role === "cliente") {
      if (!session.clientId) {
        return fail("FORBIDDEN", "Cliente precisa de escopo de cliente (x-client-id ou perfil)", 403);
      }
      if (body.client_id !== session.clientId) {
        return fail("FORBIDDEN", "Nao e possivel solicitar corrida para outro cliente", 403);
      }
    }

    const { data: clientRow, error: clientErr } = await db
      .from("clients")
      .select("id, tenant_id")
      .eq("id", body.client_id)
      .single();
    if (clientErr || !clientRow) {
      return fail("CLIENT_NOT_FOUND", "Cliente nao encontrado", 404);
    }
    if (clientRow.tenant_id !== tenantId) {
      return fail("FORBIDDEN", "Cliente nao pertence a esta organizacao", 403);
    }

    const { data, error } = await db
      .from("trips")
      .insert({
        ...body,
        tenant_id: tenantId,
        created_by: session.userId,
        operational_status: "requested"
      })
      .select("*")
      .single();

    if (error) {
      return fail("TRIP_CREATE_FAILED", error.message, 500);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.create",
      entityType: "trip",
      entityId: data.id,
      metadata: { client_id: body.client_id, operational_status: data.operational_status },
      request
    });

    const { notifyTripRequested } = await import("@/lib/notifications/operational-notify");
    await notifyTripRequested(tenantId, data.id as string, { client_id: body.client_id });

    return ok(data, 201);
  } catch (error) {
    return mapTripError(error);
  }
}

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    const query = listSchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const tenantId = assertTenantScope(session);

    let scheduledFromIso: string | null = null;
    let scheduledToIso: string | null = null;
    if (query.scheduledFrom?.trim()) {
      const t = new Date(query.scheduledFrom.trim());
      if (Number.isNaN(t.getTime())) {
        return fail("INVALID_QUERY", "scheduledFrom must be a valid ISO datetime", 400);
      }
      scheduledFromIso = t.toISOString();
    }
    if (query.scheduledTo?.trim()) {
      const t = new Date(query.scheduledTo.trim());
      if (Number.isNaN(t.getTime())) {
        return fail("INVALID_QUERY", "scheduledTo must be a valid ISO datetime", 400);
      }
      scheduledToIso = t.toISOString();
    }
    if (scheduledFromIso && scheduledToIso && scheduledFromIso > scheduledToIso) {
      return fail("INVALID_QUERY", "scheduledFrom must be before or equal to scheduledTo", 400);
    }

    let req = db.from("trips").select("*", { count: "exact" }).eq("tenant_id", tenantId);

    if (scheduledFromIso) req = req.gte("scheduled_at", scheduledFromIso);
    if (scheduledToIso) req = req.lte("scheduled_at", scheduledToIso);

    req = req.order("scheduled_at", { ascending: true }).range(from, to);

    if (can(session, "trip.read")) {
      assertCapability(session, "trip.read");
      if (query.status) req = req.eq("operational_status", query.status);
      if (query.driverId) req = req.eq("driver_id", query.driverId);
      if (query.clientId) req = req.eq("client_id", query.clientId);
    } else if (can(session, "trip.read.own")) {
      assertCapability(session, "trip.read.own");
      if (!session.clientId) {
        return fail("FORBIDDEN", "Cliente precisa de escopo de cliente (x-client-id ou perfil)", 403);
      }
      if (query.clientId && query.clientId !== session.clientId) {
        return fail("FORBIDDEN", "Nao e possivel listar viagens de outro cliente", 403);
      }
      if (query.driverId) {
        return fail("FORBIDDEN", "Filtro nao permitido para este perfil", 403);
      }
      req = req.eq("client_id", session.clientId);
      if (query.status) req = req.eq("operational_status", query.status);
    } else if (can(session, "trip.read.assigned")) {
      assertCapability(session, "trip.read.assigned");
      if (!session.driverId) {
        return fail("FORBIDDEN", "Motorista precisa de cadastro de motorista vinculado a sessao", 403);
      }
      if (query.driverId && query.driverId !== session.driverId) {
        return fail("FORBIDDEN", "Nao e possivel listar viagens de outro motorista", 403);
      }
      if (query.clientId) {
        return fail("FORBIDDEN", "Filtro nao permitido para este perfil", 403);
      }
      req = req.eq("driver_id", session.driverId);
      if (query.status) req = req.eq("operational_status", query.status);
    } else {
      assertCapability(session, "trip.read");
    }

    const { data, error, count } = await req;

    if (error) {
      return fail("TRIP_LIST_FAILED", error.message, 500);
    }

    const items = await enrichTripItemsWithVehicles(data ?? []);

    return ok({
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: count ?? 0
    });
  } catch (error) {
    return mapTripError(error);
  }
}
