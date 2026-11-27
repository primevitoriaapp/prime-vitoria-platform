import { db } from "@/lib/server/db";
import { bookPaidLinksForQuote } from "@/lib/finance/payment-links";
import { formatQuoteNumber, hasRepeat, isDiaria, itemDates, itemHours, itemsMissingForTrips, serviceLabelForClient, tripAmountsFromQuote, tripServiceModeFor } from "@/lib/quotes/quote-calc";
import { saoPauloDateAndTimeToUtcIso } from "@/lib/dates/br-date";
import { legacyServiceType, type CategoryKind, type ServiceMode } from "@/lib/pricing/category-catalog";

/** Roteiro do orçamento (paradas com nome) vira a lista de paradas da corrida no app do motorista. */
function quoteItemTripStops(it: Record<string, unknown>): Record<string, unknown> {
  const stops = (Array.isArray(it.stops) ? (it.stops as Record<string, unknown>[]) : [])
    .filter((x) => String(x.address_text ?? "").trim().length >= 3)
    .map((x) => ({ passenger_name: String(x.label ?? "").trim(), passenger_phone: null, address_text: String(x.address_text).trim(), lat: x.lat ?? null, lng: x.lng ?? null, dropped_at: null }));
  if (!stops.length) return {};
  const destLabel = String(it.destination_label ?? "").trim();
  const dest = String(it.destination_text ?? "").trim();
  if (destLabel && dest.length >= 3)
    stops.push({ passenger_name: destLabel, passenger_phone: null, address_text: dest, lat: it.destination_lat ?? null, lng: it.destination_lng ?? null, dropped_at: null, final: true } as never);
  return { trip_dropoff_stops: stops };
}

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

    const nowIso = new Date().toISOString();
    const rows = await quoteTripRows({ tenantId, quote: q as Record<string, unknown>, items: items as Record<string, unknown>[], clientId: clientId as string, actorUserId, amounts: tripAmountsFromQuote(items as never, Number(q.discount) || 0), nowIso });
    const { data: trips, error: tErr } = await db.from("trips").insert(rows).select("id");
    if (tErr) return fail("TRIPS_FAILED", tErr.message, 500);

    await db.from("quotes").update({ status: "aprovado", approved_at: nowIso, client_id: clientId, updated_at: nowIso }).eq("id", id);
    // Sinal já pago pelo link da InfinitePay: entra como pagamento das corridas criadas agora.
    await db.from("payment_links").update({ client_id: clientId }).eq("quote_id", id).is("client_id", null);
    await bookPaidLinksForQuote(tenantId, id).catch(() => undefined);
  return { ok: true, trips: trips?.length ?? 0, client_id: clientId as string };
}

/** Itens do orçamento viram corridas (confirmadas, com o valor do orçamento). */
export async function quoteTripRows(args: {
  tenantId: string;
  quote: Record<string, unknown>;
  items: Record<string, unknown>[];
  clientId: string;
  actorUserId: string | null;
  amounts: number[];
  nowIso: string;
}): Promise<Record<string, unknown>[]> {
  const { tenantId, quote: q, items, clientId, actorUserId, amounts, nowIso } = args;
    const catIds = [...new Set(items.map((i) => i.vehicle_category_id as string).filter(Boolean))];
    const kinds = new Map<string, CategoryKind>();
    if (catIds.length) {
      const { data: cats } = await db.from("vehicle_categories").select("id, kind").in("id", catIds);
      for (const c of cats ?? []) kinds.set(c.id as string, c.kind as CategoryKind);
    }

    const label = formatQuoteNumber(q.number as number);
    const rows: Record<string, unknown>[] = [];
    let n = 0;
    for (const it of items) {
      const kind = kinds.get(it.vehicle_category_id as string) ?? "carro";
      const hours = itemHours(it.service_mode as string, it.hours == null ? null : Number(it.hours));
      const mode = tripServiceModeFor(it.service_mode as string, hours) as ServiceMode;
      const diaria = isDiaria(it.service_mode as string);
      // Rotina semanal: uma corrida por dia marcado, no mesmo horário.
      const hm = it.scheduled_at
        ? new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(it.scheduled_at as string))
        : null;
      const repeat = hasRepeat(it as never);
      const whens: (string | null)[] = repeat && hm
        ? itemDates(it as never).map((d) => saoPauloDateAndTimeToUtcIso(d, hm))
        : [(it.scheduled_at as string | null) ?? null];
      const km = it.km_estimate == null ? null : Number(it.km_estimate);
      for (const when of whens)
      for (let k = 0; k < Number(it.quantity); k++) {
        const client = amounts[n++] ?? Number(it.unit_price);
        const driver = it.driver_amount == null ? null : Number(it.driver_amount);
        rows.push({
          tenant_id: tenantId,
          client_id: clientId,
          quote_id: q.id,
          service_type: legacyServiceType(kind, mode),
          vehicle_category_id: it.vehicle_category_id ?? null,
          service_mode: it.vehicle_category_id ? mode : null,
          scheduled_at: when,
          ...(km && km > 0 ? { planned_km: km } : {}),
          origin_text: it.origin_text,
          origin_lat: it.origin_lat ?? null,
          origin_lng: it.origin_lng ?? null,
          // Diária: sem destino fixo, a corrida fica "à disposição" no local de início.
          destination_text: it.destination_text || (diaria ? it.origin_text : null),
          destination_lat: it.destination_text ? (it.destination_lat ?? null) : diaria ? (it.origin_lat ?? null) : null,
          destination_lng: it.destination_text ? (it.destination_lng ?? null) : diaria ? (it.origin_lng ?? null) : null,
          ...quoteItemTripStops(it as Record<string, unknown>),
          passenger_count: it.passenger_count ?? 1,
          passenger_name: it.passenger_name ?? (q.bride_name as string | null) ?? null,
          passenger_phone: (q.bride_phone as string | null) || null,
          client_amount: client,
          driver_amount: driver,
          margin: driver == null ? client : Math.round((client - driver) * 100) / 100,
          notes: [
            q.bride_name || q.bride_phone ? `👰 Noiva: ${[q.bride_name, q.bride_phone].filter(Boolean).join(" · ")}` : null,
            q.planner_name || q.planner_phone ? `📋 Cerimonialista: ${[q.planner_name, q.planner_phone].filter(Boolean).join(" · ")}` : null,
            `${label}`,
            diaria ? serviceLabelForClient(it.service_mode as string, hours) : null,
            it.description
          ]
            .filter(Boolean)
            .join(" · "),
          operational_status: "approved",
          approved_by: actorUserId,
          approved_at: nowIso,
          created_by: actorUserId,
          presentation_minutes: 15
        });
      }
    }
  return rows;
}
