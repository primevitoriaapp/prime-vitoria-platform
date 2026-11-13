import { db } from "@/lib/server/db";
import { billingIssuerById } from "@/lib/clients/billing-terms-calc";

export type PixCharge = {
  pix_key: string | null;
  holder_name: string;
  holder_document: string | null;
  bank: string;
  agency: string | null;
  account: string | null;
  /** Uma linha pronta para e-mail/PDF. */
  line: string;
};

/** Dados de pagamento por PIX/transferência quando a fatura é cobrada sem boleto. */
export async function invoicePixCharge(inv: {
  charge_method?: string | null;
  charge_bank_account_id?: string | null;
  boleto_path?: string | null;
  billing_issuer?: string | null;
  tenant_id?: string | null;
}): Promise<PixCharge | null> {
  const cols = "issuer, bank, agency, account, pix_key, holder_name, holder_document";
  let a: Record<string, unknown> | null = null;
  if (inv.charge_method === "pix" && inv.charge_bank_account_id) {
    a = (await db.from("bank_accounts").select(cols).eq("id", inv.charge_bank_account_id).maybeSingle()).data as Record<string, unknown> | null;
  } else if (inv.charge_method !== "boleto" && !inv.boleto_path && inv.tenant_id) {
    // Sem forma de cobrança escolhida e sem boleto: usa a conta (com chave PIX) da empresa que emite a fatura.
    const q = db.from("bank_accounts").select(cols).eq("tenant_id", inv.tenant_id).eq("active", true).not("pix_key", "is", null).order("created_at").limit(1);
    a = ((await (inv.billing_issuer ? q.eq("issuer", inv.billing_issuer) : q)).data?.[0] as Record<string, unknown> | undefined) ?? null;
  }
  if (!a) return null;
  const iss = billingIssuerById(a.issuer as string);
  const holder = String(a.holder_name || (iss as { legal_name?: string } | null)?.legal_name || iss?.label || "Prime Vitória");
  const doc = (a.holder_document as string | null) || iss?.cnpj || null;
  const parts = [
    a.pix_key ? `Chave PIX: ${a.pix_key}` : null,
    `Favorecido: ${holder}${doc ? ` (CNPJ ${doc})` : ""}`,
    `Banco ${a.bank}${a.agency ? ` · Ag. ${a.agency}` : ""}${a.account ? ` · Conta ${a.account}` : ""}`
  ].filter(Boolean);
  return {
    pix_key: (a.pix_key as string | null) ?? null,
    holder_name: holder,
    holder_document: doc,
    bank: String(a.bank),
    agency: (a.agency as string | null) ?? null,
    account: (a.account as string | null) ?? null,
    line: `Pagamento por PIX/transferência — ${parts.join(" · ")}`
  };
}
