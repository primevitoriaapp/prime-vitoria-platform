import { db } from "@/lib/server/db";
import { formatQuoteNumber, isDiaria, itemHours, quoteTotals, serviceLabelForClient } from "@/lib/quotes/quote-calc";
import { BRIDAL_INCLUDED, bridalPackageById } from "@/lib/quotes/bridal-packages";
import { reaisPorExtenso } from "@/lib/contracts/number-words";

/** Modelo da ZapSign "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE TRANSPORTE EXECUTIVO" (pessoa física / casamento). */
export const CLIENT_CONTRACT_TEMPLATE_NAME = "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE TRANSPORTE EXECUTIVO";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const brTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "");
const short = (s: unknown) => String(s ?? "").split(" - ")[0].trim();
const KIND: Record<string, string> = { casamento: "Casamento", transfer: "Transfer", diaria: "Diária à disposição", van: "Transporte de grupo (van)", turismo: "Turismo", evento: "Evento" };

/** Valores das variáveis do contrato a partir do orçamento (a central confere e pode editar antes de enviar). */
export async function quoteContractValues(tenantId: string, quoteId: string): Promise<{ values: Record<string, string>; signer: { name: string; email: string | null; phone: string | null }; total: number; number: string; clientId: string | null }> {
  const { data: q } = await db.from("quotes").select("*").eq("id", quoteId).eq("tenant_id", tenantId).maybeSingle();
  if (!q) throw new Error("Orçamento não encontrado");
  const { data: items } = await db.from("quote_items").select("*").eq("quote_id", quoteId).order("position");
  const list = (items ?? []) as Record<string, unknown>[];
  const catIds = [...new Set(list.map((i) => i.vehicle_category_id as string).filter(Boolean))];
  const { data: cats } = catIds.length ? await db.from("vehicle_categories").select("id, name").in("id", catIds) : { data: [] as Record<string, unknown>[] };
  const catName = new Map((cats ?? []).map((c) => [c.id as string, String(c.name)]));
  let client: Record<string, unknown> | null = null;
  if (q.client_id) client = (await db.from("clients").select("*").eq("id", q.client_id).maybeSingle()).data as Record<string, unknown> | null;

  const totals = quoteTotals(list as never, Number(q.discount ?? 0));
  const total = Number(totals.total ?? q.total ?? 0);
  const sinal = Math.round(total * 50) / 100;
  const saldo = Math.round((total - sinal) * 100) / 100;
  const dates = list.map((i) => (i.scheduled_at as string) ?? (i.service_date ? `${i.service_date}T12:00:00-03:00` : null)).filter(Boolean) as string[];
  dates.sort();
  const first = dates[0] ?? null;
  const last = dates[dates.length - 1] ?? null;
  const pkg = list.map((i) => bridalPackageById(i.package_id as string | null)).find(Boolean) ?? null;
  const vehicles = [...new Set(list.map((i) => catName.get(i.vehicle_category_id as string)).filter(Boolean))].join(", ");
  const service = pkg?.name ?? (q.kind ? KIND[q.kind as string] : null) ?? (list.some((i) => isDiaria(i.service_mode as string)) ? "Diária à disposição" : "Transfer executivo");
  const route = (i: Record<string, unknown>) => {
    const stops = Array.isArray(i.stops) ? (i.stops as Record<string, unknown>[]) : [];
    const pts = [
      [i.origin_label, i.origin_text],
      ...stops.map((s) => [s.label, s.address_text]),
      [i.destination_label, i.destination_text]
    ]
      .map(([l, a]) => [l ? String(l) : "", short(a)].filter(Boolean).join(": "))
      .filter(Boolean);
    return pts.join(" → ");
  };
  const passengers = [...new Set(list.map((i) => String(i.passenger_name ?? "").trim()).filter(Boolean))].join(", ");
  const name = String(client?.name ?? q.contact_name ?? "").trim();
  const doc = String(client?.document ?? q.contact_document ?? "").trim();
  const phone = String(client?.whatsapp ?? client?.phone ?? q.contact_phone ?? "").trim();
  const email = String(client?.email ?? q.contact_email ?? "").trim();
  const addr = [client?.address_line, client?.address_number, client?.complement, client?.district].filter(Boolean).join(", ");
  const cityUf = [client?.city, client?.state].filter(Boolean).join("/") + (client?.postal_code ? ` · CEP ${client.postal_code}` : "");
  const number = `CT-${formatQuoteNumber(q.number as number)}`;

  const v: Record<string, string> = {
    NUMERO_CONTRATO: number,
    DATA_ASSINATURA: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    TIPO_SERVICO: service,
    TIPO_VEICULO: vehicles,
    DATA_SERVICO: first && last && brDate(first) !== brDate(last) ? `${brDate(first)} a ${brDate(last)}` : brDate(first),
    ITENS_INCLUSOS: pkg ? BRIDAL_INCLUDED : "Motorista profissional, veículo higienizado, combustível e seguro de passageiros.",
    OBSERVACOES_ITINERARIO: [list.map((i, k) => `${k + 1}) ${route(i)}`).join(" | "), String(q.notes ?? "").trim()].filter(Boolean).join(" · ").slice(0, 1500),
    VEICULO_DESCRICAO: vehicles,
    VALOR_TOTAL: brl(total),
    VALOR_TOTAL_EXTENSO: reaisPorExtenso(total),
    CONTRATANTE_NOME: name,
    CONTRATANTE_CNPJ_CPF: doc,
    CONTRATANTE_ENDERECO: addr,
    CONTRATANTE_CIDADE_UF_CEP: cityUf,
    CONTRATANTE_TELEFONE: phone,
    CONTRATANTE_EMAIL: email,
    RESPONSAVEL_NOME: name,
    RESPONSAVEL_CPF: (q.contact_type === "PF" ? doc : "") || "",
    RESPONSAVEL_CARGO: q.contact_type === "PF" ? "Contratante" : "",
    PASSAGEIROS: passengers || name,
    PERCENTUAL_SINAL: "50%",
    VALOR_SINAL: brl(sinal),
    VENCIMENTO_SINAL: "Na assinatura do contrato",
    FORMA_PAGAMENTO: "PIX ou link de pagamento (cartão de crédito)",
    PERCENTUAL_SALDO: "50%",
    VALOR_SALDO: brl(saldo),
    VENCIMENTO_SALDO: first ? `Até ${brDate(first)} (data do serviço)` : "Até a data do serviço",
    TESTEMUNHA_NOME: "",
    TESTEMUNHA_CPF: ""
  };
  for (let k = 0; k < 6; k++) {
    const i = list[k];
    const n = String(k + 1).padStart(2, "0");
    const when = (i?.scheduled_at as string) ?? (i?.service_date ? `${i.service_date}T12:00:00-03:00` : null);
    const qty = Number(i?.quantity ?? 1);
    const h = i ? itemHours(i.service_mode as string, i.hours == null ? null : Number(i.hours)) : null;
    v[`TRANSFER_${n}_DATA`] = i ? brDate(when) : "";
    v[`TRANSFER_${n}_HORARIO`] = i && i.scheduled_at ? brTime(i.scheduled_at as string) : "";
    v[`TRANSFER_${n}_VOO`] = i ? String(i.flight_number ?? "") : "";
    v[`TRANSFER_${n}_ORIGEM`] = i ? [i.origin_label, short(i.origin_text)].filter(Boolean).join(": ") : "";
    v[`TRANSFER_${n}_DESTINO`] = i
      ? [i.destination_label, short(i.destination_text)].filter(Boolean).join(": ") + (h && isDiaria(i.service_mode as string) && !i.destination_text ? serviceLabelForClient(i.service_mode as string, h) : "")
      : "";
    v[`TRANSFER_${n}_PAX`] = i ? String(i.passenger_count ?? 1) : "";
    v[`TRANSFER_${n}_VALOR`] = i ? brl(Number(i.unit_price ?? 0) * qty) : "";
  }
  return { values: v, signer: { name: name || "Contratante", email: email || null, phone: phone || null }, total, number, clientId: (q.client_id as string | null) ?? null };
}

/**
 * Confirmação automática do orçamento (regra da Prime): contrato ASSINADO + SINAL PAGO.
 * Sinal pago = link da InfinitePay de sinal/total pago, ou pagamentos que somam pelo menos 50% do total.
 */
export async function maybeAutoApproveQuote(tenantId: string, quoteId: string): Promise<{ approved: boolean; reason: string }> {
  const { data: q } = await db.from("quotes").select("id, status, total").eq("id", quoteId).eq("tenant_id", tenantId).maybeSingle();
  if (!q) return { approved: false, reason: "orçamento não encontrado" };
  if (q.status === "aprovado") return { approved: false, reason: "já aprovado" };
  const { data: cs } = await db.from("contracts").select("status").eq("quote_id", quoteId).neq("status", "cancelado");
  if (!cs?.length) return { approved: false, reason: "sem contrato" };
  if (!cs.some((c) => c.status === "assinado")) return { approved: false, reason: "contrato ainda não assinado" };
  const { data: links } = await db.from("payment_links").select("kind, amount, status").eq("quote_id", quoteId).eq("status", "pago");
  const paid = (links ?? []).reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const hasSinal = (links ?? []).some((l) => l.kind === "sinal" || l.kind === "total");
  if (!hasSinal && paid < Number(q.total ?? 0) * 0.5 - 0.01) return { approved: false, reason: "sinal ainda não pago" };
  const { approveQuote } = await import("@/lib/quotes/approve-quote");
  const r = await approveQuote(tenantId, quoteId, null);
  if (!r.ok) return { approved: false, reason: r.message };
  await db.from("audit_events").insert({ tenant_id: tenantId, action: "quote.auto_approve", entity_type: "quote", entity_id: quoteId, metadata: { motivo: "contrato assinado + sinal pago", corridas: r.trips } });
  return { approved: true, reason: `${r.trips} corrida(s) na agenda` };
}
