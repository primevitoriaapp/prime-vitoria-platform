import { db } from "@/lib/server/db";

/**
 * Quem NÃO vê valores no app/O.S.:
 *  - motorista funcionário da Prime (recebe salário);
 *  - motorista de uma EMPRESA parceira (PJ, ex.: Ilha Locadora): quem recebe é a empresa.
 * Motorista parceiro autônomo (sem empresa, ou parceiro PF) vê o que vai receber.
 */
export type PayVisibility = { hidden: boolean; reason: "funcionario" | "empresa_parceira" | null; partnerName: string | null };

export async function driverPayVisibility(driverId: string): Promise<PayVisibility> {
  const { data: d } = await db.from("drivers").select("employment_type, partner_id").eq("id", driverId).maybeSingle();
  if (!d) return { hidden: true, reason: null, partnerName: null };
  if (d.employment_type === "funcionario") return { hidden: true, reason: "funcionario", partnerName: null };
  if (d.partner_id) {
    const { data: p } = await db.from("partners").select("type, name, trade_name").eq("id", d.partner_id as string).maybeSingle();
    if (p?.type === "PJ") return { hidden: true, reason: "empresa_parceira", partnerName: String(p.trade_name || p.name || "empresa parceira") };
  }
  return { hidden: false, reason: null, partnerName: null };
}
