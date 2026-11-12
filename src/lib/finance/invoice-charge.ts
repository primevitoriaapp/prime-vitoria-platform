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
export async function invoicePixCharge(inv: { charge_method?: string | null; charge_bank_account_id?: string | null }): Promise<PixCharge | null> {
  if (inv.charge_method !== "pix" || !inv.charge_bank_account_id) return null;
  const { data: a } = await db
    .from("bank_accounts")
    .select("issuer, bank, agency, account, pix_key, holder_name, holder_document")
    .eq("id", inv.charge_bank_account_id)
    .maybeSingle();
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
