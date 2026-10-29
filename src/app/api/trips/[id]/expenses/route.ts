import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { loadTripForActor } from "@/lib/trips/trip-actor";
import { pushToStaff } from "@/lib/push/web-push";

const BUCKET = "trip-expenses";
const KINDS = ["pedagio", "estacionamento", "combustivel", "alimentacao", "outros"];
const MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };

/** Despesas da corrida (pedágio, estacionamento…) com foto do comprovante. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await loadTripForActor(id, "operational_status");
    if (!r.ok) return fail("FORBIDDEN", "Sem acesso a esta corrida", r.error === "notfound" ? 404 : 403);
    const { data } = await db.from("trip_expenses").select("*").eq("trip_id", id).order("created_at");
    const rows = await Promise.all(
      (data ?? []).map(async (e) => {
        let receipt_url: string | null = null;
        if (e.receipt_path) {
          const s = await db.storage.from(BUCKET).createSignedUrl(e.receipt_path as string, 600);
          receipt_url = s.data?.signedUrl ?? null;
        }
        return { ...e, receipt_url };
      })
    );
    return ok(rows);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await loadTripForActor(id, "operational_status");
    if (!r.ok) return fail("FORBIDDEN", "Sem acesso a esta corrida", r.error === "notfound" ? 404 : 403);
    const form = await request.formData();
    const kind = String(form.get("kind") ?? "");
    const amount = Number(String(form.get("amount") ?? "").replace(/\./g, "").replace(",", "."));
    const notes = String(form.get("notes") ?? "").slice(0, 300) || null;
    const file = form.get("file");
    if (!KINDS.includes(kind)) return fail("INVALID_KIND", "Escolha o tipo de despesa", 400);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) return fail("INVALID_AMOUNT", "Informe o valor", 400);
    let path: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) return fail("FILE_TOO_BIG", "Foto maior que 8 MB", 400);
      const ext = MIME[file.type] ?? "jpg";
      path = `${r.tenantId}/${id}/${Date.now()}.${ext}`;
      const up = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "image/jpeg" });
      if (up.error) return fail("UPLOAD_FAILED", up.error.message, 500);
    }
    const { data, error } = await db
      .from("trip_expenses")
      .insert({ tenant_id: r.tenantId, trip_id: id, driver_id: (r.trip.driver_id as string | null) ?? null, kind, amount: Math.round(amount * 100) / 100, receipt_path: path, notes })
      .select("*")
      .single();
    if (error) return fail("SAVE_FAILED", error.message, 500);
    if (r.isDriver) {
      await pushToStaff(r.tenantId, {
        title: "🧾 Despesa lançada pelo motorista",
        body: `${kind === "pedagio" ? "Pedágio" : kind === "estacionamento" ? "Estacionamento" : "Despesa"} R$ ${amount.toFixed(2).replace(".", ",")} — aprovar na Agenda`,
        url: `/agenda?trip=${id}#trip-detail`,
        tag: `exp-${data.id}`
      }).catch(() => 0);
    }
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
