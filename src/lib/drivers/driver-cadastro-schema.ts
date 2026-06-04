import { z } from "zod";
import {
  activeFlagsFromOperationalStatus,
  normalizeStringArray,
  type OperationalStatusId
} from "@/lib/drivers/driver-ficha-options";

export const driverCadastroSchema = z.object({
  profile_id: z.string().uuid().optional(),
  cpf: z.string().min(11).optional(),
  cnh_number: z.string().optional().nullable(),
  cnh_category: z.string().optional().nullable(),
  cnh_categories: z.array(z.string()).optional(),
  cnh_expiry: z.string().optional().nullable(),
  birth_date: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  postal_code: z.string().optional().nullable(),
  address_number: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  state: z.string().max(2).optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
  available: z.boolean().optional(),
  operational_status: z.enum(["ativo", "inativo", "ferias", "suspenso"]).optional(),
  operational_category: z.string().optional().nullable(),
  operational_categories: z.array(z.string()).optional(),
  service_region: z.string().optional().nullable(),
  service_regions: z.array(z.string()).optional(),
  operational_notes: z.string().optional().nullable(),
  pix_key: z.string().optional().nullable(),
  bank_name: z.string().optional().nullable(),
  bank_branch: z.string().optional().nullable(),
  bank_account: z.string().optional().nullable(),
  bank_account_type: z.string().optional().nullable(),
  payee_name: z.string().optional().nullable(),
  payee_document: z.string().optional().nullable(),
  photo_url: z.string().url().optional().nullable().or(z.literal("")),
  profile_name: z.string().min(2).optional(),
  profile_phone: z.string().optional().nullable()
});

export type DriverCadastroInput = z.infer<typeof driverCadastroSchema>;

const emptyToNull = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

export function normalizeDriverBody(body: DriverCadastroInput) {
  const out: Record<string, unknown> = {};
  if (body.cpf !== undefined) out.cpf = body.cpf.trim();
  if (body.cnh_number !== undefined) out.cnh_number = emptyToNull(body.cnh_number ?? undefined);
  if (body.cnh_expiry !== undefined) out.cnh_expiry = emptyToNull(body.cnh_expiry ?? undefined);
  if (body.birth_date !== undefined) out.birth_date = emptyToNull(body.birth_date ?? undefined);
  if (body.phone !== undefined) out.phone = emptyToNull(body.phone ?? undefined);
  if (body.whatsapp !== undefined) out.whatsapp = emptyToNull(body.whatsapp ?? undefined);
  if (body.email !== undefined) out.email = emptyToNull(body.email ?? undefined);
  if (body.postal_code !== undefined) out.postal_code = emptyToNull(body.postal_code ?? undefined);
  if (body.address_number !== undefined) out.address_number = emptyToNull(body.address_number ?? undefined);
  if (body.city !== undefined) out.city = emptyToNull(body.city ?? undefined);
  if (body.district !== undefined) out.district = emptyToNull(body.district ?? undefined);
  if (body.state !== undefined) out.state = emptyToNull(body.state ?? undefined)?.toUpperCase() ?? null;
  if (body.address !== undefined) out.address = emptyToNull(body.address ?? undefined);
  if (body.notes !== undefined) out.notes = emptyToNull(body.notes ?? undefined);
  if (body.pix_key !== undefined) out.pix_key = emptyToNull(body.pix_key ?? undefined);
  if (body.bank_name !== undefined) out.bank_name = emptyToNull(body.bank_name ?? undefined);
  if (body.bank_branch !== undefined) out.bank_branch = emptyToNull(body.bank_branch ?? undefined);
  if (body.bank_account !== undefined) out.bank_account = emptyToNull(body.bank_account ?? undefined);
  if (body.bank_account_type !== undefined) {
    out.bank_account_type = emptyToNull(body.bank_account_type ?? undefined);
  }
  if (body.payee_name !== undefined) out.payee_name = emptyToNull(body.payee_name ?? undefined);
  if (body.payee_document !== undefined) out.payee_document = emptyToNull(body.payee_document ?? undefined);
  if (body.photo_url !== undefined) out.photo_url = emptyToNull(body.photo_url ?? undefined);
  if (body.operational_notes !== undefined) out.operational_notes = emptyToNull(body.operational_notes ?? undefined);

  if (body.operational_status !== undefined) {
    const status = body.operational_status as OperationalStatusId;
    out.operational_status = status;
    const flags = activeFlagsFromOperationalStatus(status);
    out.active = flags.active;
    out.available = flags.available;
  } else {
    if (body.active !== undefined) out.active = body.active;
    if (body.available !== undefined) out.available = body.available;
  }

  const cnhCats = normalizeStringArray(body.cnh_categories);
  if (body.cnh_categories !== undefined) {
    out.cnh_categories = cnhCats;
    out.cnh_category = cnhCats.length ? cnhCats.join(",") : null;
  } else if (body.cnh_category !== undefined) {
    out.cnh_category = emptyToNull(body.cnh_category ?? undefined);
  }

  const opCats = normalizeStringArray(body.operational_categories);
  if (body.operational_categories !== undefined) {
    out.operational_categories = opCats;
    out.operational_category = opCats[0] ?? null;
  } else if (body.operational_category !== undefined) {
    out.operational_category = emptyToNull(body.operational_category ?? undefined);
  }

  const regions = normalizeStringArray(body.service_regions);
  if (body.service_regions !== undefined) {
    out.service_regions = regions;
    const labelMap: Record<string, string> = {
      grande_vitoria: "Grande Vitória",
      interior_es: "Interior ES",
      outros_estados: "Outros estados"
    };
    out.service_region = regions.map((r) => labelMap[r] ?? r).join("; ") || null;
  } else if (body.service_region !== undefined) {
    out.service_region = emptyToNull(body.service_region ?? undefined);
  }

  return out;
}

export const driverCreateSchema = z
  .object({
    profile_id: z.string().uuid().optional(),
    profile_name: z.string().min(2).optional(),
    cpf: z.string().min(11),
    cnh_number: z.string().optional()
  })
  .refine((b) => Boolean(b.profile_id) || Boolean(b.profile_name?.trim()), {
    message: "Informe o nome ou seleccione um perfil motorista."
  });

export const vehicleCadastroSchema = z.object({
  model: z.string().min(2),
  plate: z.string().min(7),
  brand: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  capacity: z.number().int().optional().nullable(),
  color: z.string().optional().nullable(),
  model_year: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional()
});

export type VehicleCadastroInput = z.infer<typeof vehicleCadastroSchema>;

export function normalizeVehicleBody(body: VehicleCadastroInput) {
  return {
    model: body.model.trim(),
    plate: body.plate.trim().toUpperCase(),
    brand: emptyToNull(body.brand ?? undefined),
    category: emptyToNull(body.category ?? undefined),
    capacity: body.capacity ?? null,
    color: emptyToNull(body.color ?? undefined),
    model_year: body.model_year ?? null,
    notes: emptyToNull(body.notes ?? undefined),
    active: body.active
  };
}
