import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { resolveDefaultVehicleForDriver } from "@/lib/vehicles/driver-default-vehicle";
import { KIND_LABEL, PROFILE_FIELDS, parseCnh, parsePix, parseProfile, parseVehicle, type ChangeKind } from "@/lib/drivers/change-request-rules";
import { resolveDriverPhotoDisplayUrl } from "@/lib/storage/driver-photo-upload";
import { pushToStaff } from "@/lib/push/web-push";

const BUCKET = "driver-docs";
const MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };

async function driverSession() {
  const session = await withResolvedDriverId(await getSessionContext());
  if (session.role !== "motorista" || !session.driverId) return null;
  return { tenantId: assertTenantScope(session), driverId: session.driverId };
}

/** Dados atuais do motorista (CNH, PIX, veículo) e os pedidos de alteração. */
export async function GET() {
  try {
    const s = await driverSession();
    if (!s) return fail("FORBIDDEN", "Apenas motoristas", 403);
    const [{ data: d }, vehicle, { data: reqs }, { data: cats }] = await Promise.all([
      db.from("drivers").select(`cnh_number, cnh_category, cnh_expires_at, cnh_expiry, pix_key, employment_type, photo_url, ${PROFILE_FIELDS.map((f) => f.key).join(", ")}` as "*").eq("id", s.driverId).maybeSingle(),
      resolveDefaultVehicleForDriver(s.driverId),
      db.from("driver_change_requests").select("id, kind, payload, status, review_note, created_at, reviewed_at").eq("driver_id", s.driverId).order("created_at", { ascending: false }).limit(20),
      db.from("vehicle_categories").select("id, name").eq("tenant_id", s.tenantId).eq("active", true).order("sort")
    ]);
    let vehicleFull: Record<string, unknown> | null = null;
    if (vehicle) {
      const { data: v } = await db.from("vehicles").select("id, brand, model, plate, color, model_year, vehicle_category_id, category").eq("id", vehicle.id).maybeSingle();
      vehicleFull = v;
      const cat = (cats ?? []).find((c) => c.id === v?.vehicle_category_id);
      if (vehicleFull) vehicleFull.category_name = (cat?.name as string | undefined) ?? (v?.category as string | null) ?? null;
    }
    return ok({
      cnh: { number: d?.cnh_number ?? null, category: d?.cnh_category ?? null, expires_at: (d?.cnh_expires_at as string | null) ?? (d?.cnh_expiry as string | null) ?? null },
      pix_key: d?.pix_key ?? null,
      profile: Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, ((d as Record<string, unknown> | null)?.[f.key] as string | null) ?? null])),
      photo_url: await resolveDriverPhotoDisplayUrl((d as { photo_url?: string | null } | null)?.photo_url ?? null).catch(() => null),
      funcionario: d?.employment_type === "funcionario",
      vehicle: vehicleFull,
      categories: cats ?? [],
      requests: reqs ?? []
    });
  } catch (error) {
    return mapApiError(error);
  }
}

/** Motorista envia uma alteração (veículo, CNH ou PIX) para a central aprovar. */
export async function POST(request: Request) {
  try {
    const s = await driverSession();
    if (!s) return fail("FORBIDDEN", "Apenas motoristas", 403);
    const form = await request.formData();
    const kind = String(form.get("kind") ?? "") as ChangeKind;
    const input = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
    let current: Record<string, unknown> = {};
    if (kind === "profile") {
      const { data: cur } = await db.from("drivers").select(PROFILE_FIELDS.map((f) => f.key).join(", ") as "*").eq("id", s.driverId).maybeSingle();
      current = (cur as Record<string, unknown> | null) ?? {};
    }
    const parsed =
      kind === "vehicle"
        ? parseVehicle(input)
        : kind === "cnh"
          ? parseCnh(input)
          : kind === "pix"
            ? parsePix(input)
            : kind === "profile"
              ? parseProfile(input, current)
              : kind === "photo"
                ? { ok: true as const, value: {} }
                : { ok: false as const, error: "Tipo inválido" };
    if (!parsed.ok) return fail("INVALID", parsed.error, 400);

    const file = form.get("file");
    let path: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > 10 * 1024 * 1024) return fail("FILE_TOO_BIG", "Arquivo maior que 10 MB", 400);
      const ext = MIME[file.type] ?? "jpg";
      path = `${s.tenantId}/${s.driverId}/${kind}-${Date.now()}.${ext}`;
      const up = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "image/jpeg" });
      if (up.error) return fail("UPLOAD_FAILED", up.error.message, 500);
    }
    if (kind === "cnh" && !path) return fail("FILE_REQUIRED", "Tire uma foto da CNH nova.", 400);
    if (kind === "vehicle" && !path) return fail("FILE_REQUIRED", "Tire uma foto do documento do carro (CRLV).", 400);
    if (kind === "photo" && (!path || !(file instanceof File) || !file.type.startsWith("image/"))) return fail("FILE_REQUIRED", "Escolha uma foto sua (rosto, de frente).", 400);

    // Um pedido pendente por tipo: o novo substitui o anterior.
    await db.from("driver_change_requests").update({ status: "recusado", review_note: "Substituído por um pedido mais novo", reviewed_at: new Date().toISOString() }).eq("driver_id", s.driverId).eq("kind", kind).eq("status", "pendente");
    const { data, error } = await db
      .from("driver_change_requests")
      .insert({ tenant_id: s.tenantId, driver_id: s.driverId, kind, payload: parsed.value, file_path: path })
      .select("id, kind, payload, status, created_at")
      .single();
    if (error) return fail("SAVE_FAILED", error.message, 500);
    const { data: d } = await db.from("drivers").select("full_name").eq("id", s.driverId).maybeSingle();
    await pushToStaff(s.tenantId, {
      title: `🪪 ${KIND_LABEL[kind]} para aprovar`,
      body: `${(d?.full_name as string | null) ?? "Motorista"} enviou pelo app. Confira em Motoristas.`,
      url: "/drivers#pedidos",
      tag: `dcr-${data.id}`
    }).catch(() => 0);
    // Também no sininho do painel (para quem não ativou os avisos no aparelho).
    await import("@/lib/notifications/enqueue-for-profiles")
      .then(({ enqueueInAppForTenantRoles }) =>
        enqueueInAppForTenantRoles(s.tenantId, ["admin", "operador"], {
          eventType: "drivers.change_request",
          title: `🪪 ${KIND_LABEL[kind]} para aprovar`,
          body: `${(d?.full_name as string | null) ?? "Motorista"} enviou pelo app. Abra Motoristas para aprovar.`
        })
      )
      .catch(() => 0);
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
