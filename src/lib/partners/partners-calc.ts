/** Regras de parceiros (funções puras). */

/** Pessoa física cadastra no máximo 2 carros; empresa (PJ) não tem limite. */
export const PF_VEHICLE_LIMIT = 2;

export function vehicleLimitFor(type: string): number | null {
  return type === "PF" ? PF_VEHICLE_LIMIT : null;
}

export type PartnerInput = {
  type: "PF" | "PJ";
  name: string;
  trade_name?: string | null;
  document?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  pix_key?: string | null;
  city?: string | null;
  notes?: string | null;
  active?: boolean;
};

export function cleanPartner(b: PartnerInput) {
  const e = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  const doc = e(b.document)?.replace(/\D+/g, "") || null;
  return {
    type: b.type,
    name: b.name.trim(),
    trade_name: e(b.trade_name),
    document: doc,
    phone: e(b.phone),
    whatsapp: e(b.whatsapp),
    email: e(b.email ?? null),
    pix_key: e(b.pix_key),
    city: e(b.city),
    notes: e(b.notes),
    ...(b.active === undefined ? {} : { active: b.active })
  };
}

