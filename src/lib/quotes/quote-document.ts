import { db } from "@/lib/server/db";
import { billingIssuerById } from "@/lib/clients/billing-terms-calc";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";
import { formatQuoteNumber, isDiaria, itemHours, quoteTotals, serviceLabelForClient } from "@/lib/quotes/quote-calc";
import { shortAddress } from "@/lib/client/short-address";
import { bridalPackageById } from "@/lib/quotes/bridal-packages";

/** "Igreja: Rua X" quando o ponto tem nome. */
function withLabel(label: unknown, text: string | null): string {
  const l = typeof label === "string" ? label.trim() : "";
  if (!l) return text ?? "";
  return text ? `${l}: ${text}` : l;
}

/** Tudo o que o orçamento mostra (página e PDF usam a mesma fonte). */
export type QuoteDoc = {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  validUntil: string | null;
  issuer: { legalName: string; cnpj: string; tradeName: string; address: string; phone: string; email: string };
  client: { name: string; legalName: string | null; docLabel: string | null; doc: string | null; address: string | null; email: string | null; phone: string | null; contact: string | null };
  groups: {
    day: string;
    title: string;
    rows: { time: string; vehicle: string; service: string; via: string[]; passengers: string | null; detail: string | null; note: string | null; from: string; to: string | null; diaria: boolean; qty: number; unit: number; total: number }[];
  }[];
  totals: { subtotal: number; discount: number; total: number; trips: number };
  notes: string | null;
  conditions: string | null;
  logoPath: string | null;
  /** Veículos usados no orçamento, com foto e descrição (para o cliente entender a diferença). */
  vehicles: { id: string; name: string; description: string | null; passengers: number | null; photoPath: string | null; photoUrl: string | null }[];
};

const ymdSP = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

export async function loadQuoteDoc(quote: Record<string, unknown>): Promise<QuoteDoc> {
  const id = quote.id as string;
  const tenantId = quote.tenant_id as string;
  const [{ data: items }, clientRes, company] = await Promise.all([
    db.from("quote_items").select("*").eq("quote_id", id).order("position"),
    quote.client_id
      ? db.from("clients").select("name, trade_name, document, email, phone, whatsapp, address_line, city, state, postal_code").eq("id", quote.client_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    getTenantCompanyProfile(tenantId)
  ]);
  const catIds = [...new Set((items ?? []).map((i) => i.vehicle_category_id as string).filter(Boolean))];
  const { data: cats } = catIds.length ? await db.from("vehicle_categories").select("id, name, description, passengers, photo_path").in("id", catIds) : { data: [] };
  const catName = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));

  const dayKey = (i: Record<string, unknown>) => (i.scheduled_at ? ymdSP(i.scheduled_at as string) : ((i.service_date as string | null) ?? ""));
  const timeOf = (i: Record<string, unknown>) =>
    i.scheduled_at ? new Date(i.scheduled_at as string).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "A combinar";
  const dayTitle = (ymd: string) => {
    if (!ymd) return "Data a combinar";
    const s = new Date(`${ymd}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const groups: QuoteDoc["groups"] = [];
  const sorted = [...(items ?? [])].sort((a, b) => `${dayKey(a)}${timeOf(a)}`.localeCompare(`${dayKey(b)}${timeOf(b)}`));
  for (const i of sorted) {
    const k = dayKey(i);
    let g = groups.find((x) => x.day === k);
    if (!g) {
      g = { day: k, title: dayTitle(k), rows: [] };
      groups.push(g);
    }
    const diaria = isDiaria(i.service_mode as string);
    const qty = Number(i.quantity) || 1;
    const unit = Number(i.unit_price) || 0;
    g.rows.push({
      time: timeOf(i),
      vehicle: catName.get(i.vehicle_category_id as string) ?? "Veículo",
      service: bridalPackageById(i.package_id as string | null)?.name ?? serviceLabelForClient(i.service_mode as string, itemHours(i.service_mode as string, i.hours == null ? null : Number(i.hours))),
      via: (Array.isArray(i.stops) ? (i.stops as Record<string, unknown>[]) : [])
        .map((x) => [x.label ? String(x.label) : null, x.address_text ? shortAddress(String(x.address_text)) : null].filter(Boolean).join(": "))
        .filter(Boolean),
      passengers: i.passenger_count ? `${i.passenger_count} pessoa(s)` : null,
      detail: (i.description as string | null) || null,
      note: (i.passenger_name as string | null) || null,
      from: withLabel(i.origin_label, i.origin_text ? (diaria && !i.package_id ? `À disposição a partir de ${shortAddress(i.origin_text as string)}` : shortAddress(i.origin_text as string)) : diaria ? "À disposição" : "A definir"),
      to: diaria && !i.package_id ? ((i.destination_text as string | null) ?? null) : withLabel(i.destination_label, i.destination_text ? shortAddress(i.destination_text as string) : i.destination_label ? "" : "A definir"),
      diaria: diaria && !i.package_id,
      qty,
      unit,
      total: unit * qty
    });
  }

  const issuerOpt = billingIssuerById(quote.issuer as string | null);
  const c = clientRes.data as Record<string, string | null> | null;
  const doc = c?.document || (quote.contact_document as string | null) || null;
  const digits = doc ? doc.replace(/\D/g, "") : "";
  const address = c
    ? [c.address_line, [c.city, c.state].filter(Boolean).join("/"), c.postal_code ? `CEP ${c.postal_code}` : null].filter(Boolean).join(" · ") || null
    : null;
  const tradeName = c?.trade_name || null;
  const legal = c?.name || null;
  const totals = quoteTotals((items ?? []).map((i) => ({ quantity: Number(i.quantity), unit_price: Number(i.unit_price) })), Number(quote.discount) || 0);

  return {
    id,
    number: formatQuoteNumber(quote.number as number),
    status: quote.status as string,
    createdAt: quote.created_at as string,
    validUntil: (quote.valid_until as string | null) ?? null,
    issuer: {
      legalName: issuerOpt?.legal_name ?? company.legal_name,
      cnpj: issuerOpt?.cnpj ?? company.cnpj,
      tradeName: company.trade_name,
      address: company.address_line,
      phone: company.phone,
      email: company.email
    },
    client: {
      name: tradeName || legal || (quote.contact_name as string) || "Cliente",
      legalName: tradeName && legal && legal !== tradeName ? legal : null,
      docLabel: doc ? (digits.length > 11 ? "CNPJ" : "CPF") : null,
      doc,
      address,
      email: c?.email || (quote.contact_email as string | null) || null,
      phone: c?.whatsapp || c?.phone || (quote.contact_phone as string | null) || null,
      contact: c && quote.contact_name ? (quote.contact_name as string) : null
    },
    groups,
    totals,
    notes: (quote.notes as string | null) || null,
    conditions: (quote.conditions as string | null) || null,
    logoPath: company.logo_storage_path,
    vehicles: (cats ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      description: (c.description as string | null) || null,
      passengers: (c.passengers as number | null) ?? null,
      photoPath: (c.photo_path as string | null) || null,
      photoUrl: c.photo_path ? `/api/public/category-photo/${c.id}?v=${encodeURIComponent(String(c.photo_path).slice(-12))}` : null
    }))
  };
}

/** Fotos (JPEG) das categorias do orçamento, para o PDF. */
export async function loadVehiclePhotos(vehicles: QuoteDoc["vehicles"]): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  await Promise.all(
    vehicles.map(async (v) => {
      const bytes = await loadLogoBytes(v.photoPath);
      if (bytes) out.set(v.id, bytes);
    })
  );
  return out;
}

/** Logo cadastrada (JPEG) para o PDF. */
export async function loadLogoBytes(path: string | null): Promise<Uint8Array | null> {
  if (!path || !/\.jpe?g$/i.test(path)) return null;
  try {
    const { data } = await db.storage.from("tenant-assets").download(path);
    if (!data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}
