import { db } from "@/lib/server/db";
import { pushToStaff } from "@/lib/push/web-push";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";

export const LINK_COLS =
  "id, tenant_id, quote_id, trip_ids, client_id, kind, description, amount, assured_installments, order_nsu, url, slug, status, paid_amount, installments, capture_method, receipt_url, paid_at, booking_payment_id, created_at";

export const KIND_LABEL: Record<string, string> = { sinal: "Sinal", saldo: "Saldo", total: "Valor total", outro: "Pagamento" };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Corridas a que o pagamento se refere: as do link ou as criadas pelo orçamento aprovado. */
async function tripsFor(link: { tenant_id: string; quote_id: string | null; trip_ids: string[] | null }): Promise<string[]> {
  if (link.trip_ids?.length) return link.trip_ids;
  if (!link.quote_id) return [];
  const { data } = await db.from("trips").select("id").eq("tenant_id", link.tenant_id).eq("quote_id", link.quote_id);
  return (data ?? []).map((t) => t.id as string);
}

/**
 * Link pago e ainda não lançado: vira "pagamento recebido" das corridas (aparece na agenda,
 * na fatura e no financeiro). Se o orçamento ainda não foi aprovado, espera a aprovação.
 */
export async function bookLinkPayment(linkId: string): Promise<boolean> {
  const { data: l } = await db.from("payment_links").select(LINK_COLS).eq("id", linkId).maybeSingle();
  if (!l || l.status !== "pago" || l.booking_payment_id) return false;
  const tripIds = await tripsFor(l as never);
  if (!tripIds.length) return false;
  const paidOn = new Date(String(l.paid_at ?? new Date().toISOString())).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { data: c } = await db.from("trips").select("client_id").in("id", tripIds).limit(1).maybeSingle();
  const extra = l.paid_amount != null && Number(l.paid_amount) > Number(l.amount) ? ` · cliente pagou ${brl(Number(l.paid_amount))} com juros do parcelamento` : "";
  const { data: bp, error } = await db
    .from("booking_payments")
    .insert({
      tenant_id: l.tenant_id,
      client_id: (c?.client_id as string | null) ?? l.client_id ?? null,
      trip_ids: tripIds,
      amount: Number(l.amount),
      method: "link_pagamento",
      account: "InfinitePay",
      installments: l.installments ?? null,
      paid_on: paidOn,
      notes: `InfinitePay · ${KIND_LABEL[l.kind as string] ?? "Pagamento"} · ${l.capture_method === "pix" ? "PIX" : l.capture_method ? "cartão" : "baixa manual"}${extra}`
    })
    .select("id")
    .single();
  if (error || !bp) return false;
  await db.from("payment_links").update({ booking_payment_id: bp.id }).eq("id", linkId).is("booking_payment_id", null);
  return true;
}

/** Depois de aprovar um orçamento: lança os links que já tinham sido pagos. */
export async function bookPaidLinksForQuote(tenantId: string, quoteId: string): Promise<void> {
  const { data } = await db.from("payment_links").select("id").eq("tenant_id", tenantId).eq("quote_id", quoteId).eq("status", "pago").is("booking_payment_id", null);
  for (const r of data ?? []) await bookLinkPayment(r.id as string).catch(() => false);
}

export async function markLinkPaid(
  linkId: string,
  info: { paid_amount: number | null; installments: number | null; capture_method: string | null; transaction_nsu: string | null; receipt_url: string | null; slug: string | null; raw: unknown }
): Promise<void> {
  const { data: l } = await db.from("payment_links").select(LINK_COLS).eq("id", linkId).maybeSingle();
  if (!l) return;
  if (l.status !== "pago") {
    await db
      .from("payment_links")
      .update({
        status: "pago",
        paid_at: new Date().toISOString(),
        paid_amount: info.paid_amount,
        installments: info.installments,
        capture_method: info.capture_method,
        transaction_nsu: info.transaction_nsu,
        receipt_url: info.receipt_url,
        slug: l.slug ?? info.slug,
        raw: info.raw as never
      })
      .eq("id", linkId);
    const where = l.quote_id ? "/orcamentos" : "/agenda";
    await pushToStaff(l.tenant_id as string, {
      title: `💳 Pagamento recebido · ${brl(Number(l.amount))}`,
      body: `${KIND_LABEL[l.kind as string] ?? "Pagamento"} · ${l.description} (InfinitePay${info.capture_method === "pix" ? ", PIX" : info.installments && info.installments > 1 ? `, ${info.installments}x` : ""})`,
      url: `${OFFICIAL_URLS.central}${where}`,
      tag: `link-${linkId}`
    }).catch(() => 0);
  }
  await bookLinkPayment(linkId).catch(() => false);
  // Sinal pago + contrato assinado → orçamento confirmado sozinho (corridas na agenda).
  if (l.quote_id) {
    const { maybeAutoApproveQuote } = await import("@/lib/contracts/quote-contract");
    await maybeAutoApproveQuote(l.tenant_id as string, l.quote_id as string).catch(() => null);
  }
}

/**
 * Link do SINAL (50%) de um orçamento, gerado sozinho quando o cliente aprova pelo link.
 * Taxa do cartão repassada ao cliente (a Prime recebe o valor cheio). Não gera de novo se já existe um em aberto ou pago.
 * Sem InfinitePay conectada, devolve null (a central gera na mão depois).
 */
export async function ensureQuoteSinalLink(tenantId: string, quoteId: string): Promise<{ url: string; amount: number } | null> {
  const { randomBytes, randomUUID } = await import("node:crypto");
  const { db } = await import("@/lib/server/db");
  const { infinitepayConfig, infinitepayCreateLink } = await import("@/lib/integrations/infinitepay");
  const { OFFICIAL_URLS } = await import("@/lib/server/official-urls");
  const { formatQuoteNumber } = await import("@/lib/quotes/quote-calc");
  const cfg = await infinitepayConfig();
  if (!cfg?.api_key) return null;
  const { data: existing } = await db
    .from("payment_links")
    .select("url, amount, status")
    .eq("tenant_id", tenantId)
    .eq("quote_id", quoteId)
    .in("status", ["aberto", "pago"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.url) return existing.status === "pago" ? null : { url: existing.url as string, amount: Number(existing.amount) };
  const { data: q } = await db.from("quotes").select("id, number, total, client_id, contact_name, contact_email, contact_phone").eq("id", quoteId).eq("tenant_id", tenantId).maybeSingle();
  const total = Number(q?.total ?? 0);
  if (!q || total <= 0) return null;
  const amount = Math.round(total * 50) / 100;
  const description = `Prime Vitória · Orçamento ${formatQuoteNumber(q.number as number)} · ${KIND_LABEL.sinal}`;
  const orderNsu = `pv-${randomUUID()}`;
  const hookToken = randomBytes(18).toString("base64url");
  const created = await infinitepayCreateLink({
    orderNsu,
    description,
    amount,
    webhookUrl: `${OFFICIAL_URLS.central}/api/webhooks/infinitepay/${hookToken}`,
    assuredInstallments: 0,
    customer: { name: q.contact_name as string | null, email: q.contact_email as string | null, phone: q.contact_phone as string | null }
  });
  await db.from("payment_links").insert({
    tenant_id: tenantId,
    quote_id: quoteId,
    trip_ids: [],
    client_id: (q.client_id as string | null) ?? null,
    kind: "sinal",
    description,
    amount,
    assured_installments: 0,
    order_nsu: orderNsu,
    hook_token: hookToken,
    url: created.url,
    slug: created.slug,
    created_by: null,
    raw: created.raw as never
  });
  return { url: created.url, amount };
}
