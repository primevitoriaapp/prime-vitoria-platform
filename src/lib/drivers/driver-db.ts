import type { PostgrestError } from "@supabase/supabase-js";
import { db } from "@/lib/server/db";
import { isMissingColumnError } from "@/lib/server/supabase-errors";

/** Campos base (0001) + photo_url (0045). */
const CORE_DRIVER_KEYS = [
  "profile_id",
  "cpf",
  "cnh_number",
  "cnh_category",
  "cnh_expiry",
  "pix_key",
  "address",
  "notes",
  "active",
  "tenant_id",
  "photo_url"
] as const;

/** Campos migration 0044. */
const EXTENDED_0044_KEYS = [
  "phone",
  "whatsapp",
  "email",
  "city",
  "district",
  "operational_category",
  "service_region",
  "operational_notes",
  "bank_name",
  "bank_branch",
  "bank_account",
  "bank_account_type",
  "payee_name",
  "payee_document",
  "available"
] as const;

/** Campos migration 0047. */
const EXTENDED_0047_KEYS = [
  "birth_date",
  "postal_code",
  "address_number",
  "state",
  "operational_status",
  "cnh_categories",
  "operational_categories",
  "service_regions"
] as const;

const ALL_OPTIONAL_KEYS = [...EXTENDED_0044_KEYS, ...EXTENDED_0047_KEYS] as const;

export type DriverRowInput = Record<string, unknown>;

function pickKeys(row: DriverRowInput, keys: readonly string[]): DriverRowInput {
  const out: DriverRowInput = {};
  for (const key of keys) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

async function applyOptionalFields(
  id: string,
  tenantId: string,
  optionalRow: DriverRowInput
): Promise<{ partialSave: boolean; warning?: string }> {
  if (Object.keys(optionalRow).length === 0) {
    return { partialSave: false };
  }

  const { error } = await db
    .from("drivers")
    .update(optionalRow)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (!error) {
    return { partialSave: false };
  }

  if (!isMissingColumnError(error)) {
    throw error;
  }

  const only0044 = pickKeys(optionalRow, EXTENDED_0044_KEYS);
  if (Object.keys(only0044).length > 0) {
    const { error: err44 } = await db
      .from("drivers")
      .update(only0044)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (err44 && !isMissingColumnError(err44)) {
      throw err44;
    }
  }

  return {
    partialSave: true,
    warning:
      "Ficha guardada parcialmente. Aplique migrations 0044, 0045 e 0047 no Supabase de staging para todos os campos."
  };
}

export async function updateDriverRow(
  id: string,
  tenantId: string,
  updatePayload: DriverRowInput
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null; partialSave?: boolean; warning?: string }> {
  const corePayload = pickKeys(updatePayload, CORE_DRIVER_KEYS);
  const optionalPayload = pickKeys(updatePayload, ALL_OPTIONAL_KEYS);

  if (Object.keys(corePayload).length > 0) {
    const coreUpdate = await db
      .from("drivers")
      .update(corePayload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();
    if (coreUpdate.error) {
      return { data: null, error: coreUpdate.error };
    }
  }

  try {
    const extra = await applyOptionalFields(id, tenantId, optionalPayload);
    const { data: refreshed, error } = await db.from("drivers").select("*").eq("id", id).eq("tenant_id", tenantId).single();
    if (error) {
      return { data: null, error };
    }
    return {
      data: refreshed as Record<string, unknown>,
      error: null,
      partialSave: extra.partialSave,
      warning: extra.warning
    };
  } catch (err) {
    return { data: null, error: err as PostgrestError };
  }
}

export async function insertDriverRow(
  row: DriverRowInput,
  tenantId: string
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null; partialSave?: boolean; warning?: string }> {
  const fullRow: DriverRowInput = { ...row, tenant_id: tenantId, active: row.active ?? true };
  const coreRow = pickKeys(fullRow, CORE_DRIVER_KEYS);
  const optionalRow = pickKeys(fullRow, ALL_OPTIONAL_KEYS);

  const inserted = await db.from("drivers").insert(coreRow).select("*").single();
  if (inserted.error || !inserted.data) {
    return { data: null, error: inserted.error };
  }

  const id = String((inserted.data as Record<string, unknown>).id);

  try {
    const extra = await applyOptionalFields(id, tenantId, optionalRow);
    const { data: refreshed } = await db.from("drivers").select("*").eq("id", id).single();
    return {
      data: (refreshed ?? inserted.data) as Record<string, unknown>,
      error: null,
      partialSave: extra.partialSave,
      warning: extra.warning
    };
  } catch (err) {
    return {
      data: inserted.data as Record<string, unknown>,
      error: err as PostgrestError,
      partialSave: true
    };
  }
}
