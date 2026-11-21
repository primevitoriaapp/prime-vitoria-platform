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

const serviceSchema = z.object({
  type: z.enum(["aeroporto", "transfer", "diaria", "casamento", "turismo", "evento"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  origin: z.string().trim().min(3).max(300),
  destination: z.string().trim().max(300).optional(),
  passengers: z.coerce.number().int().min(1).max(200),
  vehicle: z.string().trim().max(60).optional()
});

const bodySchema = z.object({
  website: z.string().max(0).optional(), // campo-isca contra robôs (fica vazio)
  name: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(10).max(30),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  /** Vários atendimentos no mesmo pedido (ex.: hoje 9h, amanhã 15h…). */
  services: z.array(serviceSchema).min(1).max(10).optional(),
  // Formato antigo: um atendimento só.
  type: serviceSchema.shape.type.optional(),
  date: serviceSchema.shape.date.optional(),
  time: serviceSchema.shape.time,
  origin: z.string().trim().max(300).optional(),
  destination: serviceSchema.shape.destination,
  passengers: z.coerce.number().int().min(1).max(200).optional(),
  vehicle: serviceSchema.shape.vehicle,
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
    const services =
      b.services ??
      (b.type && b.date && b.origin
        ? [serviceSchema.parse({ type: b.type, date: b.date, time: b.time, origin: b.origin, destination: b.destination, passengers: b.passengers ?? 1, vehicle: b.vehicle })]
        : []);
    if (!services.length) return fail("NO_SERVICE", "Informe pelo menos um atendimento.", 400);
    if (services.some((x) => x.date < today)) return fail("PAST_DATE", "Escolha datas a partir de hoje.", 400);
    const tenantId = DEFAULT_TENANT_ID;
    const fmt = (x: (typeof services)[number]) => `${TYPES[x.type].label} ${x.date.split("-").reverse().join("/")}${x.time ? ` ${x.time}` : ""}`;
    const summary = services.map(fmt).join("; ");
    const pax = Math.max(...services.map((x) => x.passengers));

    const { data: q, error } = await db
      .from("quotes")
      .insert({
        tenant_id: tenantId,
        contact_type: "PF",
        contact_name: b.name,
        contact_phone: b.phone,
        contact_email: b.email || null,
        issuer: "prime_servicos", // empresa usada no dia a dia (faturamento padrão)
        status: "rascunho",
        discount: 0,
        total: 0,
        notes: b.notes || null,
        client_response: `${b.lang === "en" ? "🌎 Cliente estrangeiro (inglês) · " : b.lang === "es" ? "🌎 Cliente estrangeiro (espanhol) · " : ""}Pedido pelo site em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}: ${services.length > 1 ? `${services.length} atendimentos — ` : ""}${summary}${b.notes ? `. Obs.: ${b.notes}` : ""}`
      })
      .select("id, number")
      .single();
    if (error) return fail("CREATE_FAILED", error.message, 500);
    const { error: iErr } = await db.from("quote_items").insert(
      services.map((x, i) => {
        const t = TYPES[x.type];
        return {
          quote_id: q.id,
          position: i,
          service_mode: t.mode,
          hours: t.hours ?? null,
          description: [t.label, x.vehicle && x.vehicle !== "Não sei" ? `veículo: ${x.vehicle}` : null].filter(Boolean).join(" · "),
          service_date: x.date,
          scheduled_at: x.time ? saoPauloDateAndTimeToUtcIso(x.date, x.time) : null,
          origin_text: x.origin,
          destination_text: x.destination || null,
          passenger_count: x.passengers,
          passenger_name: b.name,
          quantity: 1,
          unit_price: 0
        };
      })
    );
    if (iErr) {
      await db.from("quotes").delete().eq("id", q.id);
      return fail("CREATE_FAILED", iErr.message, 500);
    }

    const title = `🆕 Pedido de orçamento pelo site (${formatQuoteNumber(q.number as number)})`;
    const body = `${b.name} · ${services.length > 1 ? `${services.length} atendimentos · a partir de ${fmt(services[0])}` : fmt(services[0])} · ${pax} pessoa(s)`;
    await Promise.allSettled([
      pushToStaff(tenantId, { title, body, url: `/orcamentos?abrir=${q.id}`, tag: `quote-${q.id}` }),
      enqueueInAppForTenantRoles(tenantId, ["admin", "operador"], { eventType: "operations.quote_request", quoteId: q.id, title, body }, { correlation_id: `quote-${q.id}-site` })
    ]);
    return ok({ received: true });
  } catch (error) {
    return mapApiError(error);
  }
}
