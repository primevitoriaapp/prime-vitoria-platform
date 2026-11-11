import { db } from "@/lib/server/db";

const API = "https://api.checkout.infinitepay.io";

export type InfinitepayConfig = { handle: string; api_key: string | null };

export async function infinitepayConfig(): Promise<InfinitepayConfig | null> {
  const { data } = await db.from("app_secrets").select("value").eq("key", "infinitepay").maybeSingle();
  const v = (data?.value ?? null) as { handle?: string; api_key?: string } | null;
  const handle = String(v?.handle ?? "").trim().replace(/^\$/, "");
  if (!handle) return null;
  const key = String(v?.api_key ?? "").trim();
  return { handle, api_key: key.length > 10 ? key : null };
}

const toCents = (reais: number) => Math.round(reais * 100);
export const fromCents = (c: unknown) => (c == null || c === "" || Number.isNaN(Number(c)) ? null : Math.round(Number(c)) / 100);

export type CreateLinkInput = {
  orderNsu: string;
  description: string;
  amount: number;
  webhookUrl: string;
  assuredInstallments?: number | null;
  customer?: { name?: string | null; email?: string | null; phone?: string | null };
  validUntil?: string | null;
};

/** Procura a URL e o código do link na resposta (a documentação não fixa os nomes). */
function pickLink(j: Record<string, unknown>): { url: string | null; slug: string | null } {
  const inner = (j.data && typeof j.data === "object" ? (j.data as Record<string, unknown>) : {}) as Record<string, unknown>;
  const all = { ...inner, ...j };
  const url = [all.url, all.link, all.checkout_url, all.payment_url, all.invoice_url].find((x) => typeof x === "string" && /^https?:\/\//.test(x)) as string | undefined;
  const slug = [all.slug, all.invoice_slug, all.id].find((x) => typeof x === "string" && x.length > 2) as string | undefined;
  return { url: url ?? null, slug: slug ?? (url ? url.split("/").filter(Boolean).pop() ?? null : null) };
}

function phoneE164(p?: string | null): string | undefined {
  const d = String(p ?? "").replace(/\D/g, "");
  if (d.length < 10) return undefined;
  return `+${d.startsWith("55") && d.length >= 12 ? d : `55${d}`}`;
}

export async function infinitepayCreateLink(input: CreateLinkInput): Promise<{ url: string; slug: string | null; raw: unknown }> {
  const cfg = await infinitepayConfig();
  if (!cfg) throw new Error("InfinitePay não conectada. Coloque a InfiniteTag em Integrações.");
  const options: Record<string, unknown> = { single_payment: true };
  if (input.assuredInstallments != null) options.assured_installments = Math.max(0, Math.min(12, Math.round(input.assuredInstallments)));
  if (input.validUntil) options.valid_until = input.validUntil;
  const customer = input.customer
    ? Object.fromEntries(
        Object.entries({ name: input.customer.name?.trim() || undefined, email: input.customer.email?.trim() || undefined, phone_number: phoneE164(input.customer.phone) }).filter(([, v]) => v)
      )
    : {};
  const body: Record<string, unknown> = {
    handle: cfg.handle,
    order_nsu: input.orderNsu,
    items: [{ quantity: 1, price: toCents(input.amount), description: input.description.slice(0, 120) }],
    webhook_url: input.webhookUrl,
    ...(Object.keys(customer).length ? { customer } : {}),
    ...(cfg.api_key ? { options } : {})
  };
  const res = await fetch(`${API}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cfg.api_key ? { "X-Api-Key": cfg.api_key } : {}) },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* resposta não-JSON */
  }
  if (!res.ok) throw new Error(`InfinitePay recusou (${res.status}): ${text.slice(0, 200)}`);
  const { url, slug } = pickLink(j);
  if (!url) throw new Error(`InfinitePay não devolveu o link: ${text.slice(0, 200)}`);
  return { url, slug, raw: j };
}

export type PaymentCheck = { success: boolean; paid: boolean; amount: number | null; paid_amount: number | null; installments: number | null; capture_method: string | null };

/** Confirma na InfinitePay que o pagamento existe (o aviso deles não tem assinatura). */
export async function infinitepayPaymentCheck(input: { orderNsu: string; transactionNsu: string; slug: string }): Promise<PaymentCheck> {
  const cfg = await infinitepayConfig();
  if (!cfg) throw new Error("InfinitePay não conectada.");
  const res = await fetch(`${API}/payment_check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cfg.api_key ? { "X-Api-Key": cfg.api_key } : {}) },
    body: JSON.stringify({ handle: cfg.handle, order_nsu: input.orderNsu, transaction_nsu: input.transactionNsu, slug: input.slug })
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    success: res.ok && j.success === true,
    paid: res.ok && j.paid === true,
    amount: fromCents(j.amount),
    paid_amount: fromCents(j.paid_amount),
    installments: j.installments == null ? null : Number(j.installments),
    capture_method: (j.capture_method as string | null) ?? null
  };
}
