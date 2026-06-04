import type { PostgrestError } from "@supabase/supabase-js";
import { db } from "@/lib/server/db";
import { isMissingColumnError } from "@/lib/server/supabase-errors";

/** Campos da migration 0001 + tenant — funcionam sem migration 0044. */
const CORE_CLIENT_KEYS = ["type", "name", "document", "email", "phone", "active", "tenant_id"] as const;

/** Campos adicionados em 0044_operational_cadastro_extend.sql */
const EXTENDED_CLIENT_KEYS = [
  "trade_name",
  "whatsapp",
  "address_line",
  "city",
  "state",
  "postal_code",
  "notes",
  "registry_status"
] as const;

export type ClientRowInput = Record<string, unknown>;

export type ClientInsertResult = {
  data: Record<string, unknown>;
  partialSave?: boolean;
  warning?: string;
};

function pickKeys(row: ClientRowInput, keys: readonly string[]): ClientRowInput {
  const out: ClientRowInput = {};
  for (const key of keys) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

export async function insertClientRow(
  body: ClientRowInput,
  tenantId: string
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null; partialSave?: boolean }> {
  const fullRow: ClientRowInput = {
    ...body,
    tenant_id: tenantId,
    active: body.active ?? true
  };

  const first = await db.from("clients").insert(fullRow).select("*").single();
  if (!first.error) {
    return { data: first.data as Record<string, unknown>, error: null };
  }

  if (!isMissingColumnError(first.error)) {
    return { data: null, error: first.error };
  }

  const coreRow = pickKeys(fullRow, CORE_CLIENT_KEYS);
  const fallback = await db.from("clients").insert(coreRow).select("*").single();
  if (fallback.error) {
    return { data: null, error: fallback.error };
  }

  return {
    data: fallback.data as Record<string, unknown>,
    error: null,
    partialSave: true
  };
}

export async function updateClientRow(
  id: string,
  tenantId: string,
  updatePayload: ClientRowInput
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null; partialSave?: boolean }> {
  const first = await db
    .from("clients")
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

  const extendedSet = new Set<string>(EXTENDED_CLIENT_KEYS);
  const corePayload = Object.fromEntries(
    Object.entries(updatePayload).filter(([key]) => !extendedSet.has(key))
  );

  if (Object.keys(corePayload).length === 0) {
    return { data: null, error: first.error };
  }

  const fallback = await db
    .from("clients")
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
