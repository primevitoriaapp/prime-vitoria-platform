const AUDIT_LABELS: Record<string, string> = {
  "trip.create": "Viagem criada",
  "trip.approve": "Viagem aprovada",
  "trip.status": "Estado alterado",
  "trip.dispatch_directed": "Despacho direto",
  "trip.dispatch_auto_direct": "Despacho automático direto",
  "trip.dispatch_auto_direct_scan": "Scan de despacho automático",
  "trip.reassign": "Motorista reatribuído",
  "trip.operator_note_create": "Nota interna criada",
  "trip.operational_claim": "Atendimento assumido",
  "trip.operational_claim_auto": "Atendimento autoassumido",
  "trip.operational_claim_release": "Atendimento liberado",
  "trip.tracking_token_create": "Link de rastreio criado",
  "trip.km_update": "KM atualizado",
  "trip.km_recalculated": "KM recalculado",
  "trip.post_trip_automation_failed": "Falha no pós-corrida",
  "dispatch.offer_create": "Oferta criada",
  "dispatch.offer_approve": "Oferta aprovada",
  "dispatch.auto_offer_created": "Oferta automática criada",
  "dispatch.auto_offer_failed": "Falha na oferta automática",
  "dispatch.auto_offer_skipped": "Oferta automática ignorada",
  "finance.trip_generate": "Financeiro da viagem gerado",
  "finance.driver_payable_auto": "Pagável motorista automático",
  "finance.accounts_receivable_auto": "Conta a receber automática",
  "finance.driver_payable_paid": "Pagável motorista pago",
  "finance.driver_payable_cancelled": "Pagável motorista cancelado",
  "finance.driver_payable_reopened": "Pagável motorista reaberto",
  "finance.driver_payment_proof": "Comprovante motorista registrado",
  "finance.driver_payment_proof_upload": "Comprovante motorista enviado",
  "finance.receivable_paid": "Conta a receber paga",
  "finance.receivable_cancelled": "Conta a receber cancelada",
  "finance.receivable_reopened": "Conta a receber reaberta",
  "driver.operational_status": "Estado operacional do motorista",
  "driver.push_token_upsert": "Token push do motorista atualizado"
};

export function timelineAuditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

export function timelineMetadataSummary(metadata: Record<string, unknown>, max = 3): string | null {
  const pairs = Object.entries(metadata)
    .filter(([, value]) => value != null && value !== "")
    .slice(0, max)
    .map(([key, value]) => `${key}: ${formatMetadataValue(value)}`);
  return pairs.length > 0 ? pairs.join(" · ") : null;
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === "string") return value.length > 48 ? `${value.slice(0, 45)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.length} item(ns)]`;
  if (typeof value === "object") return "{...}";
  return String(value);
}
