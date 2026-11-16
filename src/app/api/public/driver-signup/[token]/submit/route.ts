import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { pushToStaff } from "@/lib/push/web-push";
import { leadBySignupToken, signupFolder } from "@/lib/leads/signup-token";
import { DECLARATIONS, SIGNUP_FILES, onlyDigits, validCpf } from "@/lib/drivers/driver-signup-fields";

const t = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max);
const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const yn = z.enum(["sim", "nao"]);

const dataSchema = z.object({
  full_name: t(5, 120, "Nome completo"),
  cpf: z.string().refine(validCpf, "CPF inválido"),
  rg: opt(30),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento"),
  phone: z.string().refine((v) => onlyDigits(v).length >= 10, "Celular com DDD"),
  email: z.string().trim().email("E-mail inválido").max(200),
  cep: z.string().refine((v) => onlyDigits(v).length === 8, "CEP"),
  street: t(3, 160, "Endereço"),
  number: t(1, 20, "Número"),
  complement: opt(80),
  district: t(2, 80, "Bairro"),
  city: t(2, 80, "Cidade"),
  uf: z.string().length(2, "Estado"),

  cnh_number: z.string().refine((v) => onlyDigits(v).length >= 9, "Número da CNH"),
  cnh_category: t(1, 3, "Categoria da CNH"),
  cnh_first_date: opt(10),
  cnh_expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Validade da CNH"),
  cnh_ear: yn,

  bond: z.enum(["autonomo", "mei", "pj"]),
  company_name: opt(160),
  cnpj: opt(20),
  issues_invoice: yn,
  states: z.array(z.string().length(2)).min(1, "Estados em que atua"),
  regions: opt(300),
  exec_experience: yn,
  experience_time: opt(40),
  languages: z.array(z.string().max(40)).min(1, "Idiomas"),
  languages_other: opt(80),
  formal_attire: yn,
  services: z.array(z.string().max(60)).max(12).optional(),

  vehicle_model: t(2, 80, "Marca e modelo"),
  vehicle_plate: z.string().refine((v) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(v.toUpperCase().replace(/[^A-Z0-9]/g, "")), "Placa"),
  vehicle_year: opt(10),
  vehicle_color: opt(30),
  insured: yn,
  insurance_app: z.enum(["sim", "nao", ""]).optional(),
  insurance_rcfv: z.enum(["sim", "nao", ""]).optional(),
  other_vehicle: opt(300),

  criminal_record_date: opt(10),

  pix_type: t(2, 30, "Tipo de chave PIX"),
  pix_key: t(3, 120, "Chave PIX"),
  bank_account: t(3, 160, "Banco, agência e conta"),
  account_holder: opt(120),

  emergency_name: t(5, 120, "Nome do contato de emergência"),
  emergency_phone: z.string().refine((v) => onlyDigits(v).length >= 10, "Telefone do contato de emergência"),
  emergency_cpf: z.string().refine(validCpf, "CPF do contato de emergência"),
  emergency_email: z.string().trim().email("E-mail do contato de emergência").max(200),
  emergency_relation: t(2, 60, "Parentesco do contato de emergência"),
  witness_ok: yn
});

const bodySchema = z.object({
  data: dataSchema,
  files: z.record(z.string().max(300)),
  declarations: z.record(z.literal(true))
});

/** Recebe o cadastro completo do motorista. Depois de enviado, só a central altera. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const lead = await leadBySignupToken(token);
    if (!lead) return fail("NOT_FOUND", "Link inválido ou expirado. Fale com a central.", 404);
    if (lead.completed_at) return fail("DONE", "Este cadastro já foi enviado.", 409);
    const b = bodySchema.parse(await request.json());

    for (const d of DECLARATIONS) if (!b.declarations[d.key]) return fail("VALIDATION_ERROR", "Marque todas as declarações para enviar.", 400);
    const folder = signupFolder(lead);
    const files: Record<string, string> = {};
    for (const f of SIGNUP_FILES) {
      const p = b.files[f.kind];
      if (p && p.startsWith(folder)) files[f.kind] = p;
      else if (f.required) return fail("VALIDATION_ERROR", `Falta enviar: ${f.label}.`, 400);
    }
    if (b.data.insured === "sim" && !files.apolice_seguro) return fail("VALIDATION_ERROR", "Envie a apólice do seguro.", 400);
    if (b.data.bond !== "autonomo" && onlyDigits(b.data.cnpj).length !== 14) return fail("VALIDATION_ERROR", "Informe o CNPJ.", 400);

    const data = {
      ...b.data,
      cpf: onlyDigits(b.data.cpf),
      emergency_cpf: onlyDigits(b.data.emergency_cpf),
      vehicle_plate: b.data.vehicle_plate.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      declarations: Object.keys(b.declarations),
      declared_at: new Date().toISOString(),
      declared_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    };
    const { error } = await db
      .from("site_leads")
      .update({ complete_data: data, complete_files: files, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", lead.id)
      .is("completed_at", null);
    if (error) return fail("SAVE_FAILED", "Não conseguimos salvar. Tente de novo.", 500);

    await pushToStaff(lead.tenant_id, {
      title: "📋 Cadastro completo de motorista",
      body: `${b.data.full_name} enviou documentos e dados para análise.`,
      url: "/cadastros-site",
      tag: `lead-complete-${lead.id}`
    }).catch(() => 0);
    return ok({ received: true });
  } catch (e) {
    return mapApiError(e);
  }
}
