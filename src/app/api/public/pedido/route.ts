import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { pushToStaff } from "@/lib/push/web-push";
import { enqueueInAppForTenantRoles } from "@/lib/notifications/enqueue-for-profiles";
import { saoPauloDateAndTimeToUtcIso } from "@/lib/dates/br-date";
import { formatQuoteNumber } from "@/lib/quotes/quote-calc";

const TYPES: Record<string, { label: string; mode: string; hours?: number }> = {
  aeroporto: { label: "Transfer aeroporto", mode: "transfer" },
  transfer: { label: "Transfer", mode: "transfer" },
  diaria: { label: "Carro à disposição (diária)", mode: "diaria", hours: 8 },
  casamento: { label: "Casamento", mode: "diaria", hours: 5 },
  turismo: { label: "Turismo / passeio", mode: "diaria", hours: 8 },
  evento: { label: "Evento / grupo", mode: "transfer" }
};

const bodySchema = z.object({
  website: z.string().max(0).optional(), // campo-isca contra robôs (fica vazio)
  name: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(10).max(30),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  type: z.enum(["aeroporto", "transfer", "diaria", "casamento", "turismo", "evento"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  origin: z.string().trim().min(3).max(300),
  destination: z.string().trim().max(300).optional(),
  passengers: z.coerce.number().int().min(1).max(200),
  vehicle: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(1500).optional(),
  lang: z.enum(["pt", "en", "es"]).optional()
});

const hits = new Map<string, number[]>();

/** Pedido de orçamento pelo site (pessoa física ou empresa nova): vira orçamento em rascunho para a central. */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "x";
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600000);
    if (recent.length >= 5) return fail("RATE_LIMIT", "Muitos pedidos seguidos. Fale com a gente pelo WhatsApp.", 429);
    hits.set(ip, [...recent, now]);

    const b = bodySchema.parse(await request.json());
    if (b.website) return ok({ received: true });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    if (b.date < today) return fail("PAST_DATE", "Escolha uma data a partir de hoje.", 400);
    const t = TYPES[b.type];
    const tenantId = DEFAULT_TENANT_ID;
    const scheduled = b.time ? saoPauloDateAndTimeToUtcIso(b.date, b.time) : null;
    const description = [t.label, b.vehicle && b.vehicle !== "nao_sei" ? `veículo: ${b.vehicle}` : null].filter(Boolean).join(" · ");

    const { data: q, error } = await db
      .from("quotes")
      .insert({
        tenant_id: tenantId,
        contact_type: "PF",
        contact_name: b.name,
        contact_phone: b.phone,
        contact_email: b.email || null,
        issuer: "rj_prime",
        status: "rascunho",
        discount: 0,
        total: 0,
        notes: b.notes || null,
        client_response: `${b.lang === "en" ? "🌎 Cliente estrangeiro (inglês) · " : b.lang === "es" ? "🌎 Cliente estrangeiro (espanhol) · " : ""}Pedido pelo site em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}: ${t.label}, ${b.passengers} pessoa(s)${b.vehicle ? `, prefere ${b.vehicle}` : ""}${b.notes ? `. Obs.: ${b.notes}` : ""}`
      })
      .select("id, number")
      .single();
    if (error) return fail("CREATE_FAILED", error.message, 500);
    await db.from("quote_items").insert({
      quote_id: q.id,
      position: 0,
      service_mode: t.mode,
      hours: t.hours ?? null,
      description,
      service_date: b.date,
      scheduled_at: scheduled,
      origin_text: b.origin,
      destination_text: b.destination || null,
      passenger_count: b.passengers,
      passenger_name: b.name,
      quantity: 1,
      unit_price: 0
    });

    const title = `🆕 Pedido de orçamento pelo site (${formatQuoteNumber(q.number as number)})`;
    const body = `${b.name} · ${t.label} · ${b.date.split("-").reverse().join("/")}${b.time ? ` ${b.time}` : ""} · ${b.passengers} pessoa(s)`;
    await Promise.allSettled([
      pushToStaff(tenantId, { title, body, url: "/orcamentos", tag: `quote-${q.id}` }),
      enqueueInAppForTenantRoles(tenantId, ["admin", "operador"], { eventType: "operations.quote_request", quoteId: q.id, title, body }, { correlation_id: `quote-${q.id}-site` })
    ]);
    return ok({ received: true });
  } catch (error) {
    return mapApiError(error);
  }
}
