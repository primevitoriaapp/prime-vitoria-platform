import { randomInt } from "node:crypto";
import { db } from "@/lib/server/db";
import { hashDriverPin } from "@/lib/auth/driver-pin-crypto";
import { insertDriverRow } from "@/lib/drivers/driver-db";
import { linkVehicleToDriver } from "@/lib/vehicles/driver-default-vehicle";
import { fillSourceFor } from "@/lib/contracts/fill-source";
import { fillTemplate } from "@/lib/contracts/template-fill";
import { partySignUrl } from "@/lib/contracts/contracts";
import { zapsignAddSigner, zapsignCreateFromTemplate, zapsignTemplateVariables, type NewSigner } from "@/lib/integrations/zapsign";

/** Arquivo do cadastro do site → tipo de documento na ficha do motorista. */
const DOC_KIND: Record<string, string> = {
  cnh: "cnh",
  comprovante_residencia: "comprovante_residencia",
  antecedentes: "antecedentes",
  crlv: "crlv",
  apolice_seguro: "seguro",
  foto_dianteira: "foto_frente",
  foto_traseira: "foto_traseira",
  foto_lateral_esquerda: "foto_lateral_esq",
  foto_lateral_direita: "foto_lateral_dir"
};
const VEHICLE_DOCS = new Set(["crlv", "seguro", "foto_frente", "foto_traseira", "foto_lateral_esq", "foto_lateral_dir"]);

const s = (v: unknown) => (v == null ? "" : String(v).trim());
const digits = (v: unknown) => s(v).replace(/\D/g, "");
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export type ActivateInput = {
  tenantId: string;
  userId: string;
  leadId: string;
  categoryIds: string[];
  templateId: string | null;
  signers: NewSigner[]; // assinantes além do motorista (Prime, testemunhas)
};

export type ActivateResult = {
  driverId: string;
  pin: string;
  vehicle: string | null;
  docs: number;
  contract: { status: "criado" | "sem_modelo" | "erro"; message?: string };
  warnings: string[];
};

export class ActivateError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/**
 * Transforma o cadastro completo do site em motorista ativo:
 * ficha, veículo, documentos, PIN de acesso ao app e contrato na ZapSign.
 * Ele só aceita corridas depois de assinar (drivers.contract_required).
 */
export async function activateLead(inp: ActivateInput): Promise<ActivateResult> {
  const { tenantId, leadId } = inp;
  const { data: lead } = await db
    .from("site_leads")
    .select("id, kind, name, phone, email, city, status, complete_data, complete_files, completed_at, driver_id")
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!lead || lead.kind !== "motorista") throw new ActivateError("NOT_FOUND", "Cadastro não encontrado.");
  if (lead.driver_id) throw new ActivateError("ALREADY", "Este motorista já foi ativado.");
  if (!lead.completed_at || !lead.complete_data) throw new ActivateError("INCOMPLETE", "Ele ainda não terminou o cadastro completo.");
  const c = lead.complete_data as Record<string, unknown>;
  const cpf = digits(c.cpf);
  if (cpf.length !== 11) throw new ActivateError("CPF", "CPF do cadastro inválido.");

  // Mesmo CPF já cadastrado: não duplica.
  const { data: same } = await db.from("drivers").select("id, full_name, cpf").eq("tenant_id", tenantId);
  const dup = (same ?? []).find((d) => digits(d.cpf) === cpf);
  if (dup) throw new ActivateError("DUPLICATE", `Já existe um motorista com este CPF: ${String(dup.full_name ?? "")}.`);

  const warnings: string[] = [];
  const pin = String(randomInt(0, 10000)).padStart(4, "0");
  const phone = s(c.phone) || s(lead.phone);
  const notes = [
    "Cadastrado pelo site (ativado pela central).",
    c.bond ? `Vínculo: ${c.bond === "pj" ? "Pessoa jurídica" : c.bond === "mei" ? "MEI" : "Autônomo"}${c.company_name ? ` · ${s(c.company_name)}` : ""}${c.cnpj ? ` · CNPJ ${s(c.cnpj)}` : ""}` : "",
    c.pix_type ? `PIX (${s(c.pix_type)}): ${s(c.pix_key)}` : "",
    c.bank_account ? `Conta: ${s(c.bank_account)}${c.account_holder ? ` · titular ${s(c.account_holder)}` : ""}` : "",
    c.emergency_name ? `Emergência: ${s(c.emergency_name)} (${s(c.emergency_relation)}) ${s(c.emergency_phone)}` : "",
    Array.isArray(c.services) && c.services.length ? `Serviços: ${(c.services as string[]).join(", ")}` : "",
    Array.isArray(c.languages) && c.languages.length ? `Idiomas: ${(c.languages as string[]).join(", ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const { data: driver, error } = await insertDriverRow(
    {
      full_name: s(c.full_name) || s(lead.name),
      cpf,
      rg: s(c.rg) || null,
      birth_date: s(c.birth_date) || null,
      phone,
      whatsapp: phone,
      email: s(c.email) || s(lead.email) || null,
      postal_code: s(c.cep) || null,
      address_line: s(c.street) || null,
      number: s(c.number) || null,
      complement: s(c.complement) || null,
      district: s(c.district) || null,
      city: s(c.city) || s(lead.city) || null,
      state: s(c.uf) || null,
      cnh_number: digits(c.cnh_number) || null,
      cnh_category: s(c.cnh_category) || null,
      cnh_expires_at: s(c.cnh_expires_at) || null,
      pix_key: s(c.pix_key) || null,
      bank_name: s(c.bank_account) || null,
      employment_type: "parceiro",
      vehicle_category_ids: inp.categoryIds,
      notes,
      active: true
    } as never,
    tenantId
  );
  if (error || !driver) throw new ActivateError("DRIVER_FAILED", `Não consegui criar o motorista: ${error?.message ?? "erro"}`);
  const driverId = String(driver.id);
  await db.from("drivers").update({ pin_hash: hashDriverPin(pin), pin_set_at: new Date().toISOString(), contract_required: true, status: "active" }).eq("id", driverId);

  // Veículo: reaproveita se a placa já existe.
  let vehicleId: string | null = null;
  let vehicleLabel: string | null = null;
  const plate = s(c.vehicle_plate).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (plate) {
    const { data: vs } = await db.from("vehicles").select("id, plate, model").eq("tenant_id", tenantId);
    const found = (vs ?? []).find((v) => s(v.plate).toUpperCase().replace(/[^A-Z0-9]/g, "") === plate);
    const catId = inp.categoryIds[0] ?? null;
    const { data: cat } = catId ? await db.from("vehicle_categories").select("name").eq("id", catId).maybeSingle() : { data: null };
    if (found) {
      vehicleId = String(found.id);
      warnings.push(`A placa ${plate} já estava cadastrada; vinculei o veículo existente.`);
    } else {
      const year = Number(digits(c.vehicle_year).slice(0, 4)) || null;
      const { data: v, error: ve } = await db
        .from("vehicles")
        .insert({
          tenant_id: tenantId,
          model: s(c.vehicle_model) || "Veículo",
          plate,
          color: s(c.vehicle_color) || null,
          model_year: year,
          category: cat?.name ?? null,
          vehicle_category_id: catId,
          capacity: 4,
          status: "available",
          active: true,
          notes: "Cadastrado pelo site."
        })
        .select("id")
        .single();
      if (ve || !v) warnings.push(`Não consegui cadastrar o veículo: ${ve?.message ?? "erro"}`);
      else vehicleId = String(v.id);
    }
    if (vehicleId) {
      try {
        await linkVehicleToDriver({ tenantId, driverId, vehicleId, setDefault: true });
        vehicleLabel = `${s(c.vehicle_model)} · ${plate}`;
      } catch (e) {
        warnings.push(`Veículo criado, mas não vinculado: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
  } else warnings.push("O cadastro não tinha placa: vincule o veículo na ficha do motorista.");

  // Documentos: os arquivos já estão no armazenamento privado; só registra na ficha dele.
  const files = (lead.complete_files ?? {}) as Record<string, string>;
  const crimDate = s(c.criminal_record_date);
  const rows = Object.entries(files)
    .filter(([k, p]) => DOC_KIND[k] && p)
    .map(([k, p]) => {
      const kind = DOC_KIND[k]!;
      return {
        tenant_id: tenantId,
        driver_id: driverId,
        vehicle_id: VEHICLE_DOCS.has(kind) ? vehicleId : null,
        kind,
        storage_path: p,
        file_name: p.split("/").pop() ?? null,
        mime: /\.pdf$/i.test(p) ? "application/pdf" : "image/jpeg",
        valid_until: kind === "antecedentes" && /^\d{4}-\d{2}-\d{2}$/.test(crimDate) ? addDays(crimDate, 90) : null,
        uploaded_by: inp.userId
      };
    });
  if (rows.length) {
    const { error: de } = await db.from("driver_documents").insert(rows);
    if (de) warnings.push(`Documentos não registrados na ficha: ${de.message}`);
  }

  // Contrato na ZapSign, preenchido com os dados dele.
  let contract: ActivateResult["contract"] = { status: "sem_modelo" };
  if (inp.templateId) {
    try {
      const tpl = await zapsignTemplateVariables(inp.templateId);
      const src = await fillSourceFor(tenantId, { driverId });
      if (c.cnpj) src.CNPJ = s(c.cnpj);
      const fields = fillTemplate(tpl.variables, src).filter((f) => f.value.trim());
      const first: NewSigner = { name: s(c.full_name) || s(lead.name), email: s(c.email) || null, phone, role: "Motorista" };
      const doc = await zapsignCreateFromTemplate({ templateId: inp.templateId, signer: first, data: fields.map((f) => ({ de: f.variable, para: f.value })), externalId: driverId });
      const signers: { name: string; email: string | null; status?: string; sign_url: string | null; signed_at: null; role?: string }[] = (doc.signers ?? []).map((x, i) => ({ name: x.name, email: x.email ?? null, status: x.status, sign_url: x.sign_url ?? null, signed_at: null, role: i === 0 ? "Motorista" : "Modelo" }));
      const norm = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();
      for (const o of inp.signers) {
        // O modelo da ZapSign pode já trazer a Prime/testemunhas: não duplica.
        if (signers.some((x) => norm(x.name) === norm(o.name))) continue;
        try {
          const added = await zapsignAddSigner(doc.token, { ...o, email: o.email || null });
          signers.push({ name: added.name ?? o.name, email: added.email ?? o.email ?? null, status: added.status ?? "new", sign_url: added.sign_url ?? null, signed_at: null, role: o.role });
        } catch {
          signers.push({ name: o.name, email: o.email ?? null, status: "erro", sign_url: null, signed_at: null, role: o.role });
          warnings.push(`Não consegui incluir ${o.name} como assinante.`);
        }
      }
      const title = `${tpl.name} — ${first.name}`;
      await db.from("contracts").insert({
        tenant_id: tenantId,
        driver_id: driverId,
        title,
        zapsign_token: doc.token,
        signers,
        status: "pendente",
        sign_url: partySignUrl(signers, first.name),
        synced_at: new Date().toISOString(),
        created_by: inp.userId,
        notes: "Criado na ativação do cadastro do site."
      });
      contract = { status: "criado" };
    } catch (e) {
      contract = { status: "erro", message: e instanceof Error ? e.message : "erro" };
      warnings.push(`Contrato não foi criado (${contract.message}). Crie em Motoristas → Contratos; ele só aceita corridas depois de assinar.`);
    }
  } else warnings.push("Nenhum modelo de contrato escolhido: crie o contrato na ficha dele. Ele só aceita corridas depois de assinar.");

  await db
    .from("site_leads")
    .update({ status: "aprovado", driver_id: driverId, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", leadId);

  return { driverId, pin, vehicle: vehicleLabel, docs: rows.length, contract, warnings };
}
