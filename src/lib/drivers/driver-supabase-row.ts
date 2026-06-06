/**
 * Mapeamento entre ficha/API e colunas REAIS de public.drivers (Supabase linked).
 * Gerado a partir de information_schema — não usar nomes das migrations 0047 se divergirem.
 */

/** Colunas existentes hoje em public.drivers (staging linked). */
export const DRIVERS_TABLE_COLUMNS = new Set([
  "id",
  "profile_id",
  "cpf",
  "cnh_number",
  "cnh_category",
  "cnh_expires_at",
  "pix_key",
  "address",
  "notes",
  "active",
  "created_at",
  "tenant_id",
  "operational_status",
  "operational_status_updated_at",
  "full_name",
  "phone",
  "whatsapp",
  "email",
  "city",
  "state",
  "address_line",
  "postal_code",
  "birth_date",
  "operational_categories",
  "regions",
  "status",
  "bank_name",
  "bank_agency",
  "bank_account",
  "bank_account_type",
  "available",
  "photo_url",
  "number",
  "complement",
  "payout_price_per_km",
  "payout_percent",
  "pin_hash",
  "pin_set_at"
]);

/** Campo do normalizeDriverBody / formulário → coluna Postgres. */
const FORM_TO_DB_COLUMN: Record<string, string> = {
  cnh_expiry: "cnh_expires_at",
  address_number: "number",
  bank_branch: "bank_agency",
  service_regions: "regions",
  district: "complement"
};

/** Nunca persistir (perfil separado, GPS, legado ou coluna inexistente). */
const PATCH_OMIT_KEYS = new Set([
  "profile_name",
  "profile_phone",
  "operational_status",
  "service_region",
  "operational_category",
  "cnh_categories",
  "payee_name",
  "payee_document",
  "pin_hash",
  "pin_set_at"
]);

/**
 * Converte o payload normalizado da ficha para um UPDATE válido em drivers.
 */
export function canonicalDriverPatchRow(normalized: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(normalized)) {
    if (PATCH_OMIT_KEYS.has(key)) continue;

    const dbKey = FORM_TO_DB_COLUMN[key] ?? key;
    if (!DRIVERS_TABLE_COLUMNS.has(dbKey)) continue;

    row[dbKey] = value;
  }

  if (normalized.operational_notes !== undefined && normalized.operational_notes !== null) {
    const opNotes = String(normalized.operational_notes).trim();
    if (opNotes) {
      const existing = typeof row.notes === "string" ? row.notes.trim() : "";
      row.notes = existing ? `${existing}\n${opNotes}` : opNotes;
    }
  }

  return row;
}

/** Expõe linha do Supabase com nomes usados pela UI da ficha. */
export function driverRowToApiShape<T extends Record<string, unknown>>(row: T): T & {
  cnh_expiry?: string | null;
  address_number?: string | null;
  bank_branch?: string | null;
  service_regions?: unknown;
  district?: string | null;
} {
  const cnh_expires_at = row.cnh_expires_at;
  const number = row.number;
  const bank_agency = row.bank_agency;
  const regions = row.regions;
  const complement = row.complement;

  return {
    ...row,
    cnh_expiry:
      (typeof row.cnh_expiry === "string" ? row.cnh_expiry : null) ??
      (typeof cnh_expires_at === "string" ? cnh_expires_at : null) ??
      null,
    address_number:
      (typeof row.address_number === "string" ? row.address_number : null) ??
      (typeof number === "string" ? number : null) ??
      null,
    bank_branch:
      (typeof row.bank_branch === "string" ? row.bank_branch : null) ??
      (typeof bank_agency === "string" ? bank_agency : null) ??
      null,
    service_regions: row.service_regions ?? regions ?? null,
    district:
      (typeof row.district === "string" ? row.district : null) ??
      (typeof complement === "string" ? complement : null) ??
      null
  };
}
