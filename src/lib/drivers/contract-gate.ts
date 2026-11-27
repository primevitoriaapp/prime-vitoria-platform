import { db } from "@/lib/server/db";
import { syncPending, type ContractRow } from "@/lib/contracts/contracts";

export type ContractGate = { required: boolean; signed: boolean; sign_url: string | null; title: string | null };

/**
 * Motorista ativado pelo cadastro do site só aceita corrida depois de assinar o contrato.
 * Os motoristas antigos (contract_required = false) não são afetados.
 */
export async function driverContractGate(driverId: string): Promise<ContractGate> {
  const { data: d } = await db.from("drivers").select("contract_required").eq("id", driverId).maybeSingle();
  if (!d?.contract_required) return { required: false, signed: true, sign_url: null, title: null };
  const { data } = await db.from("contracts").select("*").eq("driver_id", driverId).neq("status", "cancelado").order("created_at", { ascending: false });
  const rows = await syncPending((data ?? []) as ContractRow[]).catch(() => (data ?? []) as ContractRow[]);
  if (rows.some((r) => r.status === "assinado")) {
    await db.from("drivers").update({ contract_required: false }).eq("id", driverId);
    return { required: true, signed: true, sign_url: null, title: null };
  }
  const pending = rows.find((r) => r.status === "pendente");
  return { required: true, signed: false, sign_url: pending?.sign_url ?? null, title: pending?.title ?? null };
}

export const CONTRACT_BLOCK_MESSAGE = "Assine seu contrato com a Prime Vitória para começar a aceitar corridas. Abra o app em Início e toque em “Assinar contrato”.";
