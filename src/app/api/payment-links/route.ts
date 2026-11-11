import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { infinitepayConfig, infinitepayCreateLink } from "@/lib/integrations/infinitepay";
import { KIND_LABEL, LINK_COLS } from "@/lib/finance/payment-links";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";
import { formatQuoteNumber } from "@/lib/quotes/quote-calc";

async function staff() {
  const session = await getSessionContext();
  if (!["admin", "operador", "financeiro"].includes(session.role)) return { session, denied: fail("FORBIDDEN", "Sem permissão", 403) };
  return { session, denied: null };
}

/** Links de um orçamento (?quote_id=) ou de uma corrida (?trip_id=, inclui os do orçamento dela). */
export async function GET(request: Request) {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const u = new URL(request.url);
    const quoteId = u.searchParams.get("quote_id");
    const tripId = u.searchParams.get("trip_id");
    const cfg = await infinitepayConfig();
    let rows: Record<string, unknown>[] = [];
    if (quoteId) {
      const { data } = await db.from("payment_links").select(LINK_COLS).eq("tenant_id", tenantId).eq("quote_id", quoteId).order("created_at");
      rows = data ?? [];
    } else if (tripId) {
      const { data: t } = await db.from("trips").select("quote_id, booking_group_id").eq("id", tripId).eq("tenant_id", tenantId).maybeSingle();
      const { data: a } = await db.from("payment_links").select(LINK_COLS).eq("tenant_id", tenantId).contains("trip_ids", [tripId]);
      const { data: b } = t?.quote_id ? await db.from("payment_links").select(LINK_COLS).eq("tenant_id", tenantId).eq("quote_id", t.quote_id) : { data: [] };
      const seen = new Set<string>();
      rows = [...(a ?? []), ...(b ?? [])].filter((r) => (seen.has(r.id as string) ? false : (seen.add(r.id as string), true)));
    } else return fail("BAD_REQUEST", "Informe quote_id ou trip_id", 400);
    return ok({ connected: Boolean(cfg?.api_key), links: rows.map((r) => ({ ...r, amount: Number(r.amount), paid_amount: r.paid_amount == null ? null : Number(r.paid_amount) })) });
  } catch (e) {
    return mapApiError(e);
  }
}

const bodySchema = z
  .object({
    quote_id: z.string().uuid().optional(),
    trip_id: z.string().uuid().optional(),
    kind: z.enum(["sinal", "saldo", "total", "outro"]),
    amount: z.coerce.number().min(1).max(500000),
    assured_installments: z.coerce.number().int().min(0).max(12).default(1),
    description: z.string().trim().max(120).optional()
  })
  .refine((b) => b.quote_id || b.trip_id, "Informe o orçamento ou a corrida");

/** Gera o link na InfinitePay (um pagamento só) já ligado ao orçamento/corrida. */
export async function POST(request: Request) {
  try {
    const { session, denied } = await staff();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const b = bodySchema.parse(await request.json());
    const cfg = await infinitepayConfig();
    if (!cfg?.api_key) return fail("NOT_CONNECTED", "InfinitePay não conectada. Em Integrações, coloque a InfiniteTag e a chave da API.", 400);

    let clientId: string | null = null;
    let tripIds: string[] = [];
    let ref = "";
    let customer: { name?: string | null; email?: string | null; phone?: string | null } | undefined;
    if (b.quote_id) {
      const { data: q } = await db.from("quotes").select("id, number, client_id, contact_name, contact_email, contact_phone, status").eq("id", b.quote_id).eq("tenant_id", tenantId).maybeSingle();
      if (!q) return fail("NOT_FOUND", "Orçamento não encontrado", 404);
      clientId = (q.client_id as string | null) ?? null;
      ref = `Orçamento ${formatQuoteNumber(q.number as number)}`;
      customer = { name: q.contact_name as string | null, email: q.contact_email as string | null, phone: q.contact_phone as string | null };
    } else {
      const { data: t } = await db.from("trips").select("id, client_id, scheduled_at, booking_group_id, passenger_name").eq("id", b.trip_id!).eq("tenant_id", tenantId).maybeSingle();
      if (!t) return fail("NOT_FOUND", "Corrida não encontrada", 404);
      clientId = (t.client_id as string | null) ?? null;
      tripIds = [t.id as string];
      if (t.booking_group_id) {
        const { data: sib } = await db.from("trips").select("id").eq("tenant_id", tenantId).eq("booking_group_id", t.booking_group_id);
        tripIds = [...new Set([...tripIds, ...(sib ?? []).map((x) => x.id as string)])];
      }
      const day = new Date(String(t.scheduled_at)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
      ref = `Transporte ${day}${tripIds.length > 1 ? ` (${tripIds.length} serviços)` : ""}`;
      if (clientId) {
        const { data: c } = await db.from("clients").select("name, trade_name, email, whatsapp, phone").eq("id", clientId).maybeSingle();
        customer = c ? { name: (c.trade_name as string) || (c.name as string), email: c.email as string | null, phone: (c.whatsapp as string) || (c.phone as string) } : undefined;
      }
    }

    const description = b.description?.trim() || `Prime Vitória · ${ref} · ${KIND_LABEL[b.kind]}`;
    const orderNsu = `pv-${randomUUID()}`;
    const hookToken = randomBytes(18).toString("base64url");
    const webhookUrl = `${OFFICIAL_URLS.central}/api/webhooks/infinitepay/${hookToken}`;

    const created = await infinitepayCreateLink({ orderNsu, description, amount: b.amount, webhookUrl, assuredInstallments: b.assured_installments, customer });

    const { data: row, error } = await db
      .from("payment_links")
      .insert({
        tenant_id: tenantId,
        quote_id: b.quote_id ?? null,
        trip_ids: tripIds,
        client_id: clientId,
        kind: b.kind,
        description,
        amount: b.amount,
        assured_installments: b.assured_installments,
        order_nsu: orderNsu,
        hook_token: hookToken,
        url: created.url,
        slug: created.slug,
        created_by: session.userId,
        raw: created.raw as never
      })
      .select(LINK_COLS)
      .single();
    if (error) return fail("SAVE_FAILED", `O link foi criado (${created.url}) mas não foi salvo: ${error.message}`, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "payment_link.create", entityType: "payment_link", entityId: row.id as string, metadata: { amount: b.amount, kind: b.kind, quote_id: b.quote_id ?? null, trip_id: b.trip_id ?? null }, request });
    return ok({ ...row, amount: Number(row.amount) });
  } catch (e) {
    return mapApiError(e);
  }
}
