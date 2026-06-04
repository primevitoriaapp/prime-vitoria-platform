import type { PostgrestError } from "@supabase/supabase-js";
import { db } from "@/lib/server/db";
import { isMissingColumnError } from "@/lib/server/supabase-errors";

/** Campos da migration 0001 + tenant — sempre disponíveis. */
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

/** 0046_client_service_types.sql */
const SERVICE_TYPES_KEY = "service_types";

const ALL_OPTIONAL_KEYS = [...EXTENDED_CLIENT_KEYS, SERVICE_TYPES_KEY] as const;

export type ClientRowInput = Record<string, unknown>;

function pickKeys(row: ClientRowInput, keys: readonly string[]): ClientRowInput {
  const out: ClientRowInput = {};
  for (const key of keys) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

function splitPayload(row: ClientRowInput, tenantId: string) {
  const fullRow: ClientRowInput = {
    ...row,
    tenant_id: tenantId,
    active: row.active ?? true
  };
  const coreRow = pickKeys(fullRow, CORE_CLIENT_KEYS);
  const optionalRow = pickKeys(fullRow, ALL_OPTIONAL_KEYS);
  return { coreRow, optionalRow };
}

async function applyOptionalFields(
  id: string,
  tenantId: string,
  optionalRow: ClientRowInput
): Promise<{ partialSave: boolean; warning?: string }> {
  if (Object.keys(optionalRow).length === 0) {
    return { partialSave: false };
  }

  const { error } = await db
    .from("clients")
    .update(optionalRow)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (!error) {
    return { partialSave: false };
  }

  if (!isMissingColumnError(error)) {
    throw error;
  }

  const extendedOnly = pickKeys(optionalRow, EXTENDED_CLIENT_KEYS);
  if (Object.keys(extendedOnly).length > 0) {
    const { error: extErr } = await db
      .from("clients")
      .update(extendedOnly)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (extErr && !isMissingColumnError(extErr)) {
      throw extErr;
    }
  }

  return {
    partialSave: true,
    warning:
      "Cliente guardado com dados essenciais. Para endereço, WhatsApp e tipos de serviço completos, aplique as migrations 0044 e 0046 no Supabase de staging."
  };
}

/** Insere sempre pelo núcleo (0001) e depois aplica campos extra — cadastro funciona sem 0044. */
export async function insertClientRow(
  body: ClientRowInput,
  tenantId: string
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null; partialSave?: boolean; warning?: string }> {
  const { coreRow, optionalRow } = splitPayload(body, tenantId);

  const inserted = await db.from("clients").insert(coreRow).select("*").single();
  if (inserted.error || !inserted.data) {
    return { data: null, error: inserted.error };
  }

  const id = String((inserted.data as Record<string, unknown>).id);

  try {
    const extra = await applyOptionalFields(id, tenantId, optionalRow);
    const { data: refreshed } = await db.from("clients").select("*").eq("id", id).single();
    return {
      data: (refreshed ?? inserted.data) as Record<string, unknown>,
      error: null,
      partialSave: extra.partialSave,
      warning: extra.warning
    };
  } catch (err) {
    const pg = err as PostgrestError;
    return {
      data: inserted.data as Record<string, unknown>,
      error: pg,
      partialSave: true
    };
  }
}

export async function updateClientRow(
  id: string,
  tenantId: string,
  updatePayload: ClientRowInput
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null; partialSave?: boolean; warning?: string }> {
  const corePayload = pickKeys(updatePayload, CORE_CLIENT_KEYS);
  const optionalPayload = pickKeys(updatePayload, ALL_OPTIONAL_KEYS);

  if (Object.keys(corePayload).length > 0) {
    const coreUpdate = await db
      .from("clients")
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
    const { data: refreshed, error } = await db.from("clients").select("*").eq("id", id).eq("tenant_id", tenantId).single();
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
