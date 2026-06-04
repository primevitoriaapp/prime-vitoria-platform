import { z } from "zod";

export const driverCadastroSchema = z.object({
  profile_id: z.string().uuid().optional(),
  cpf: z.string().min(11).optional(),
  cnh_number: z.string().optional().nullable(),
  cnh_category: z.string().optional().nullable(),
  cnh_expiry: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  city: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
  available: z.boolean().optional(),
  operational_category: z.string().optional().nullable(),
  service_region: z.string().optional().nullable(),
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
  if (body.cnh_category !== undefined) out.cnh_category = emptyToNull(body.cnh_category ?? undefined);
  if (body.cnh_expiry !== undefined) out.cnh_expiry = emptyToNull(body.cnh_expiry ?? undefined);
  if (body.phone !== undefined) out.phone = emptyToNull(body.phone ?? undefined);
  if (body.whatsapp !== undefined) out.whatsapp = emptyToNull(body.whatsapp ?? undefined);
  if (body.email !== undefined) out.email = emptyToNull(body.email ?? undefined);
  if (body.city !== undefined) out.city = emptyToNull(body.city ?? undefined);
  if (body.district !== undefined) out.district = emptyToNull(body.district ?? undefined);
  if (body.address !== undefined) out.address = emptyToNull(body.address ?? undefined);
  if (body.notes !== undefined) out.notes = emptyToNull(body.notes ?? undefined);
  if (body.active !== undefined) out.active = body.active;
  if (body.available !== undefined) out.available = body.available;
  if (body.operational_category !== undefined) {
    out.operational_category = emptyToNull(body.operational_category ?? undefined);
  }
  if (body.service_region !== undefined) out.service_region = emptyToNull(body.service_region ?? undefined);
  if (body.operational_notes !== undefined) out.operational_notes = emptyToNull(body.operational_notes ?? undefined);
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
  return out;
}

export const driverCreateSchema = driverCadastroSchema.extend({
  profile_id: z.string().uuid(),
  cpf: z.string().min(11)
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
