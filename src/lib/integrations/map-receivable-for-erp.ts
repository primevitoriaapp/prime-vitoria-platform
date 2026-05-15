import type { SupabaseClient } from "@supabase/supabase-js";
import type { Provider, ReceivableDTO } from "./types";

/**
 * Enriquece o DTO com IDs externos do cliente (e item CA, opcional) via `erp_entity_mappings`.
 *
 * - `entity_type = 'client'`, `internal_id` = UUID do cliente interno, `external_id`:
 *   - Omie: codigo numerico como string (ex: `"4214850"`)
 *   - Conta Azul: UUID do cliente no CA
 * - `entity_type = 'conta_azul_item'`, mesmo `internal_id` do cliente: UUID do item/servico no CA (opcional)
 */
export async function enrichReceivableFromErpMappings(
  db: SupabaseClient,
  provider: Provider,
  dto: ReceivableDTO,
  tenantId: string
): Promise<ReceivableDTO> {
  let next: ReceivableDTO = { ...dto };

  const { data: clientMap } = await db
    .from("erp_entity_mappings")
    .select("external_id")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .eq("entity_type", "client")
    .eq("internal_id", dto.clientInternalId)
    .maybeSingle();

  if (clientMap?.external_id) {
    if (provider === "omie") {
      const n = Number(clientMap.external_id);
      if (Number.isFinite(n)) {
        next = { ...next, omieCodigoClienteFornecedor: n };
      }
    } else {
      next = { ...next, contaAzulIdCliente: clientMap.external_id };
    }
  }

  if (provider === "conta_azul") {
    const { data: itemMap } = await db
      .from("erp_entity_mappings")
      .select("external_id")
      .eq("tenant_id", tenantId)
      .eq("provider", "conta_azul")
      .eq("entity_type", "conta_azul_item")
      .eq("internal_id", dto.clientInternalId)
      .maybeSingle();

    if (itemMap?.external_id) {
      next = { ...next, contaAzulIdItemServico: itemMap.external_id };
    }
  }

  return next;
}
