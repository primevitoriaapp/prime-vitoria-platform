import { db } from "@/lib/server/db";
import type { FillSource } from "@/lib/contracts/template-fill";

const br = (ymd: string | null | undefined) => (ymd ? String(ymd).slice(0, 10).split("-").reverse().join("/") : "");
const cpfFmt = (v: string | null | undefined) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(v ?? "");
};
const cnpjFmt = (v: string | null | undefined) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : String(v ?? "");
};

/** Dados do cadastro para preencher o modelo do contrato. */
export async function fillSourceFor(tenantId: string, party: { driverId?: string | null; clientId?: string | null }): Promise<FillSource> {
  const today = br(new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }));
  if (party.driverId) {
    const { data: d } = await db.from("drivers").select("*").eq("id", party.driverId).eq("tenant_id", tenantId).maybeSingle();
    if (!d) return { DATA: today };
    const { data: link } = await db.from("driver_vehicle_links").select("vehicle_id, is_default").eq("driver_id", party.driverId).eq("active", true).is("end_at", null).order("is_default", { ascending: false }).limit(1).maybeSingle();
    const { data: v } = link ? await db.from("vehicles").select("brand, model, plate, model_year, color, renavam, chassis").eq("id", link.vehicle_id).maybeSingle() : { data: null };
    const { data: p } = d.partner_id ? await db.from("partners").select("document, type").eq("id", d.partner_id).maybeSingle() : { data: null };
    const street = [d.address_line, d.number, d.complement].filter(Boolean).join(", ");
    const endereco = [street || d.address, d.district, d.city && d.state ? `${d.city}/${d.state}` : d.city, d.postal_code ? `CEP ${d.postal_code}` : null].filter(Boolean).join(" - ");
    const pdoc = String(p?.document ?? "").replace(/\D/g, "");
    return {
      NOME: d.full_name,
      CPF: cpfFmt(d.cpf),
      RG: d.rg,
      ESTADO_CIVIL: d.marital_status,
      CNPJ: pdoc.length === 14 ? cnpjFmt(pdoc) : "",
      ENDERECO: endereco,
      CEP: d.postal_code,
      CIDADE: d.city,
      UF: d.state,
      EMAIL: d.email,
      TELEFONE: d.whatsapp || d.phone,
      CNH: d.cnh_number,
      CNH_CATEGORIA: d.cnh_category,
      CNH_VALIDADE: br(d.cnh_expires_at ?? d.cnh_expiry),
      NASCIMENTO: br(d.birth_date),
      VEICULO: v ? [v.brand, v.model].filter(Boolean).join(" ") : "",
      PLACA: v?.plate ?? "",
      ANO: v?.model_year ? String(v.model_year) : "",
      COR: v?.color ?? "",
      RENAVAM: v?.renavam ?? "",
      CHASSI: v?.chassis ?? "",
      DATA: today
    };
  }
  const { data: c } = await db.from("clients").select("*").eq("id", party.clientId as string).eq("tenant_id", tenantId).maybeSingle();
  if (!c) return { DATA: today };
  const doc = String(c.document ?? "").replace(/\D/g, "");
  return {
    NOME: c.name,
    CPF: doc.length === 11 ? cpfFmt(doc) : "",
    CNPJ: doc.length === 14 ? cnpjFmt(doc) : "",
    ENDERECO: [c.address_line, c.city && c.state ? `${c.city}/${c.state}` : c.city, c.postal_code ? `CEP ${c.postal_code}` : null].filter(Boolean).join(" - "),
    CEP: c.postal_code,
    CIDADE: c.city,
    UF: c.state,
    EMAIL: c.email,
    TELEFONE: c.whatsapp || c.phone,
    DATA: today
  };
}
