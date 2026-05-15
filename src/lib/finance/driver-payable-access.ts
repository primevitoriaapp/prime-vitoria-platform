import type { SessionContext } from "@/lib/domain/types";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/http";
import { assertCapability } from "@/lib/security/rbac";

type PayableRow = { id: string; trip_id: string; driver_id: string; tenant_id: string };

export type DriverPayableAccessIntent = "read" | "write";

export async function loadDriverPayableForSession(
  session: SessionContext,
  tenantId: string,
  payableId: string,
  intent: DriverPayableAccessIntent = "write"
): Promise<{ row: PayableRow } | { error: ReturnType<typeof fail> }> {
  const { data: row, error } = await db
    .from("driver_payables")
    .select("id, trip_id, driver_id, tenant_id")
    .eq("id", payableId)
    .maybeSingle();

  if (error || !row) {
    return { error: fail("PAYABLE_NOT_FOUND", "Título não encontrado", 404) };
  }
  if (row.tenant_id !== tenantId) {
    return { error: fail("FORBIDDEN", "Título fora do tenant", 403) };
  }

  if (session.role === "motorista") {
    assertCapability(session, intent === "read" ? "finance.payable.read.own" : "finance.payable.proof.own");
    if (!session.driverId || row.driver_id !== session.driverId) {
      return { error: fail("FORBIDDEN", "Sem acesso a este pagamento", 403) };
    }
  } else {
    assertCapability(session, intent === "read" ? "finance.read" : "finance.write");
  }

  return { row: row as PayableRow };
}
