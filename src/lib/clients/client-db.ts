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

/** 0058_client_contract_storage.sql */
const CONTRACT_PATH_KEY = "contract_storage_path";

/** 0063_client_portal_requests_enabled.sql */
const PORTAL_REQUESTS_KEY = "portal_requests_enabled";

const ALL_OPTIONAL_KEYS = [
  ...EXTENDED_CLIENT_KEYS,
  SERVICE_TYPES_KEY,
  CONTRACT_PATH_KEY,
  PORTAL_REQUESTS_KEY
] as const;

const LIST_CORE_SELECT = "id,type,name,document,email,phone,active,tenant_id,created_at";
const LIST_EXTENDED_SELECT = [
  ...EXTENDED_CLIENT_KEYS,
  SERVICE_TYPES_KEY,
  CONTRACT_PATH_KEY,
  PORTAL_REQUESTS_KEY
].join(",");

export type ClientListRow = {
  id: string;
  type: string;
  name: string;
  trade_name?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  registry_status?: string | null;
  active: boolean;
  tenant_id?: string | null;
  service_types?: string[] | null;
  contract_storage_path?: string | null;
  portal_requests_enabled?: boolean;
  created_at?: string;
};

export type ClientRowInput = Record<string, unknown>;

/** Lista clientes do tenant (colunas explícitas + fallback se migrations 0044/0046/0058 não aplicadas). */
export async function listActiveClientsForTenant(
  tenantId: string,
  opts?: { includeInactive?: boolean; limit?: number }
): Promise<ClientListRow[]> {
  const limit = opts?.limit ?? 200;
  const runQuery = (select: string) => {
    let req = db.from("clients").select(select).eq("tenant_id", tenantId).order("name").limit(limit);
    if (!opts?.includeInactive) {
      req = req.eq("active", true);
    }
    return req;
  };

  let { data, error } = await runQuery(`${LIST_CORE_SELECT},${LIST_EXTENDED_SELECT}`);
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await runQuery(LIST_CORE_SELECT));
  }
  if (error) {
    throw error;
  }
  return (data ?? []) as unknown as ClientListRow[];
}

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
