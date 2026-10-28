/** Situação do repasse ao parceiro: a Prime só paga depois que o cliente paga. */

export type PayoutStage = "aguardando_cliente" | "liberado" | "pago" | "cancelado";

export function payoutStage(payableStatus: string | null | undefined, receivableStatus: string | null | undefined): PayoutStage {
  if (payableStatus === "paid") return "pago";
  if (payableStatus === "cancelled") return "cancelado";
  if (receivableStatus === "paid") return "liberado";
  return "aguardando_cliente";
}

export function payoutStageLabel(stage: PayoutStage, paidAt?: string | null): string {
  switch (stage) {
    case "pago": {
      if (!paidAt) return "Pago";
      const d = new Date(paidAt);
      return Number.isFinite(d.getTime())
        ? `Pago em ${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
        : "Pago";
    }
    case "liberado":
      return "Liberado para pagamento";
    case "cancelado":
      return "Cancelado";
    default:
      return "Aguardando pagamento do cliente";
  }
}
