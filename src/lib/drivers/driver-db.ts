import type { PostgrestError } from "@supabase/supabase-js";
import { db } from "@/lib/server/db";
import { isMissingColumnError } from "@/lib/server/supabase-errors";

/** Campos base (0001) + photo_url (0045). profile_id opcional (0048). */
const CORE_DRIVER_KEYS = [
  "cpf",
  "cnh_number",
  "cnh_category",
  "cnh_expiry",
  "pix_key",
  "address",
  "notes",
  "active",
  "tenant_id",
  "photo_url",
  "profile_id",
  "full_name"
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

/** Campos migration 0049 — repasse motorista. */
const EXTENDED_0049_PAYOUT_KEYS = ["payout_price_per_km", "payout_percent"] as const;

const OPTIONAL_BATCHES = [
  EXTENDED_0044_KEYS,
  EXTENDED_0047_KEYS,
  EXTENDED_0049_PAYOUT_KEYS
] as const;

export type DriverRowInput = Record<string, unknown>;

function pickKeys(row: DriverRowInput, keys: readonly string[]): DriverRowInput {
  const out: DriverRowInput = {};
  for (const key of keys) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

async function applyOptionalBatch(
  id: string,
  tenantId: string,
  batch: DriverRowInput
): Promise<boolean> {
  if (Object.keys(batch).length === 0) return false;

  const { error } = await db
    .from("drivers")
    .update(batch)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (!error) return false;
  if (isMissingColumnError(error)) return true;
  throw error;
}

async function applyOptionalFields(
  id: string,
  tenantId: string,
  optionalRow: DriverRowInput
): Promise<{ partialSave: boolean; warning?: string }> {
  let partialSave = false;

  for (const keySet of OPTIONAL_BATCHES) {
    const batch = pickKeys(optionalRow, keySet);
    const skipped = await applyOptionalBatch(id, tenantId, batch);
    if (skipped) partialSave = true;
  }

  if (partialSave) {
    return {
      partialSave: true,
      warning:
        "Ficha guardada parcialmente. Aplique migrations 0044, 0047 e 0049 no Supabase de staging para todos os campos."
    };
  }
  return { partialSave: false };
}

export async function updateDriverRow(
  id: string,
  tenantId: string,
  updatePayload: DriverRowInput
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null; partialSave?: boolean; warning?: string }> {
  const corePayload = pickKeys(updatePayload, CORE_DRIVER_KEYS);
  const optionalPayload: DriverRowInput = {};
  for (const keySet of OPTIONAL_BATCHES) {
    Object.assign(optionalPayload, pickKeys(updatePayload, keySet));
  }

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

function buildInsertCoreRow(fullRow: DriverRowInput, tenantId: string): DriverRowInput {
  const coreRow = pickKeys(fullRow, CORE_DRIVER_KEYS);
  coreRow.tenant_id = tenantId;
  coreRow.active = fullRow.active ?? true;
  if (coreRow.profile_id == null || coreRow.profile_id === "") {
    delete coreRow.profile_id;
  }
  return coreRow;
}

export async function insertDriverRow(
  row: DriverRowInput,
  tenantId: string
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null; partialSave?: boolean; warning?: string }> {
  const fullRow: DriverRowInput = { ...row, tenant_id: tenantId, active: row.active ?? true };
  const coreRow = buildInsertCoreRow(fullRow, tenantId);
  const optionalRow: DriverRowInput = {};
  for (const keySet of OPTIONAL_BATCHES) {
    Object.assign(optionalRow, pickKeys(fullRow, keySet));
  }

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
