import { db } from "@/lib/server/db";
import { formatQuoteNumber, isDiaria, itemHours, itemsMissingForTrips, serviceLabelForClient, tripAmountsFromQuote, tripServiceModeFor } from "@/lib/quotes/quote-calc";
import { legacyServiceType, type CategoryKind, type ServiceMode } from "@/lib/pricing/category-catalog";

export type ApproveResult = { ok: true; trips: number; client_id: string } | { ok: false; code: string; message: string; status: number };

const fail = (code: string, message: string, status: number): ApproveResult => ({ ok: false, code, message, status });

/**
 * Orçamento aprovado (pela central ou pelo próprio cliente no link): cria o cliente se precisar
 * e as corridas na agenda, já confirmadas, com o valor do orçamento.
 */
export async function approveQuote(tenantId: string, id: string, actorUserId: string | null): Promise<ApproveResult> {
    const { data: q } = await db.from("quotes").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!q) return fail("NOT_FOUND", "Orçamento não encontrado", 404);
    if (q.status === "aprovado") return fail("ALREADY", "Este orçamento já foi aprovado.", 409);
    const { data: items } = await db.from("quote_items").select("*").eq("quote_id", id).order("position");
    if (!items?.length) return fail("NO_ITEMS", "Orçamento sem itens.", 400);
    const missing = itemsMissingForTrips(items as never);
    if (missing.length) {
      const txt = missing.map((m) => `item ${m.index + 1}: falta ${m.missing.join(", ")}`).join("; ");
      return fail("INCOMPLETE_ITEMS", `Complete antes de aprovar — ${txt}.`, 400);
    }

    // Cliente: usa o do orçamento ou cria a partir do contato.
    let clientId = q.client_id as string | null;
    if (!clientId) {
      const { data: c, error } = await db
        .from("clients")
        .insert({
          tenant_id: tenantId,
          type: q.contact_type ?? "PJ",
          name: q.contact_name,
          document: q.contact_document ? String(q.contact_document).replace(/\D+/g, "") || null : null,
          phone: q.contact_phone ?? null,
          whatsapp: q.contact_phone ?? null,
          email: q.contact_email ?? null,
          billing_issuer: q.issuer ?? null,
          active: true
        })
        .select("id")
        .single();
      if (error) return fail("CLIENT_CREATE_FAILED", error.message, 500);
      clientId = c.id as string;
    } else if (q.issuer) {
      await db.from("clients").update({ billing_issuer: q.issuer }).eq("id", clientId).is("billing_issuer", null);
    }

    const catIds = [...new Set(items.map((i) => i.vehicle_category_id as string).filter(Boolean))];
    const kinds = new Map<string, CategoryKind>();
    if (catIds.length) {
      const { data: cats } = await db.from("vehicle_categories").select("id, kind").in("id", catIds);
      for (const c of cats ?? []) kinds.set(c.id as string, c.kind as CategoryKind);
    }

    const amounts = tripAmountsFromQuote(items as never, Number(q.discount) || 0);
    const label = formatQuoteNumber(q.number as number);
    const nowIso = new Date().toISOString();
    const rows: Record<string, unknown>[] = [];
    let n = 0;
    for (const it of items) {
      const kind = kinds.get(it.vehicle_category_id as string) ?? "carro";
      const hours = itemHours(it.service_mode as string, it.hours == null ? null : Number(it.hours));
      const mode = tripServiceModeFor(it.service_mode as string, hours) as ServiceMode;
      const diaria = isDiaria(it.service_mode as string);
      for (let k = 0; k < Number(it.quantity); k++) {
        const client = amounts[n++] ?? Number(it.unit_price);
        const driver = it.driver_amount == null ? null : Number(it.driver_amount);
        rows.push({
          tenant_id: tenantId,
          client_id: clientId,
          quote_id: id,
          service_type: legacyServiceType(kind, mode),
          vehicle_category_id: it.vehicle_category_id ?? null,
          service_mode: it.vehicle_category_id ? mode : null,
          scheduled_at: it.scheduled_at,
          origin_text: it.origin_text,
          origin_lat: it.origin_lat ?? null,
          origin_lng: it.origin_lng ?? null,
          // Diária: sem destino fixo, a corrida fica "à disposição" no local de início.
          destination_text: it.destination_text || (diaria ? it.origin_text : null),
          destination_lat: it.destination_text ? (it.destination_lat ?? null) : diaria ? (it.origin_lat ?? null) : null,
          destination_lng: it.destination_text ? (it.destination_lng ?? null) : diaria ? (it.origin_lng ?? null) : null,
          passenger_count: it.passenger_count ?? 1,
          passenger_name: it.passenger_name ?? null,
          client_amount: client,
          driver_amount: driver,
          margin: driver == null ? client : Math.round((client - driver) * 100) / 100,
          notes: [`${label}`, diaria ? serviceLabelForClient(it.service_mode as string, hours) : null, it.description].filter(Boolean).join(" · "),
          operational_status: "approved",
          approved_by: actorUserId,
          approved_at: nowIso,
          created_by: actorUserId,
          presentation_minutes: 15
        });
      }
    }
    const { data: trips, error: tErr } = await db.from("trips").insert(rows).select("id");
    if (tErr) return fail("TRIPS_FAILED", tErr.message, 500);

    await db.from("quotes").update({ status: "aprovado", approved_at: nowIso, client_id: clientId, updated_at: nowIso }).eq("id", id);
  return { ok: true, trips: trips?.length ?? 0, client_id: clientId as string };
}
