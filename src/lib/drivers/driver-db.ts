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
const EXTENDED_DRIVER_KEYS = [
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

export type DriverRowInput = Record<string, unknown>;

function pickKeys(row: DriverRowInput, keys: readonly string[]): DriverRowInput {
  const out: DriverRowInput = {};
  for (const key of keys) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

function stripExtended(row: DriverRowInput): DriverRowInput {
  const extended = new Set<string>(EXTENDED_DRIVER_KEYS);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !extended.has(key)));
}

export async function updateDriverRow(
  id: string,
  tenantId: string,
  updatePayload: DriverRowInput
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null; partialSave?: boolean }> {
  const first = await db
    .from("drivers")
    .update(updatePayload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (!first.error) {
    return { data: first.data as Record<string, unknown>, error: null };
  }

  if (!isMissingColumnError(first.error)) {
    return { data: null, error: first.error };
  }

  const corePayload = stripExtended(updatePayload);
  if (Object.keys(corePayload).length === 0) {
    return { data: null, error: first.error };
  }

  const fallback = await db
    .from("drivers")
    .update(corePayload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (fallback.error) {
    return { data: null, error: fallback.error };
  }

  return {
    data: fallback.data as Record<string, unknown>,
    error: null,
    partialSave: true
  };
}

export async function insertDriverRow(
  row: DriverRowInput,
  tenantId: string
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null; partialSave?: boolean }> {
  const fullRow = { ...row, tenant_id: tenantId };

  const first = await db.from("drivers").insert(fullRow).select("*").single();
  if (!first.error) {
    return { data: first.data as Record<string, unknown>, error: null };
  }

  if (!isMissingColumnError(first.error)) {
    return { data: null, error: first.error };
  }

  const coreRow = pickKeys(fullRow, CORE_DRIVER_KEYS);
  const fallback = await db.from("drivers").insert(coreRow).select("*").single();
  if (fallback.error) {
    return { data: null, error: fallback.error };
  }

  return {
    data: fallback.data as Record<string, unknown>,
    error: null,
    partialSave: true
  };
}
