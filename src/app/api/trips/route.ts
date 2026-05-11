import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { assertCapability, can } from "@/lib/security/rbac";
import { getSessionContext } from "@/lib/server/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  driverId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional()
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

    if (session.role === "cliente") {
      if (!session.clientId) {
        return fail("FORBIDDEN", "Cliente precisa de escopo de cliente (x-client-id ou perfil)", 403);
      }
      if (body.client_id !== session.clientId) {
        return fail("FORBIDDEN", "Nao e possivel solicitar corrida para outro cliente", 403);
      }
    }

    const { data, error } = await db
      .from("trips")
      .insert({ ...body, created_by: session.userId, operational_status: "requested" })
      .select("*")
      .single();

    if (error) {
      return fail("TRIP_CREATE_FAILED", error.message, 500);
    }

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

    let req = db
      .from("trips")
      .select("*", { count: "exact" })
      .order("scheduled_at", { ascending: true })
      .range(from, to);

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

    return ok({
      items: data ?? [],
      page: query.page,
      pageSize: query.pageSize,
      total: count ?? 0
    });
  } catch (error) {
    return mapTripError(error);
  }
}
