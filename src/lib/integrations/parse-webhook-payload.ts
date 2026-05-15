import type { Provider } from "./types";

const PV_INTEGRATION_RE = /^PV-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

export type WebhookEventKind = "receivable_paid" | "receivable_updated" | "unknown";

export type ParsedWebhookEvent = {
  kind: WebhookEventKind;
  integrationCode?: string;
  receivableInternalId?: string;
  externalId?: string;
  eventLabel?: string;
};

const PAID_HINTS = [
  "baixa",
  "liquidado",
  "liquidada",
  "pago",
  "paid",
  "payment.received",
  "contareceber.baixa",
  "recebimento",
  "recebimento.confirmado",
  "sale.paid",
  "titulo.quitado"
];

const OMIE_PAID_TOPIC_PARTS = ["financas.contareceber.baixa", "contareceber.baixado", "contareceber.liquidado"];

const CA_PAID_TOPIC_PARTS = ["payment.received", "sale.paid", "recebimento", "venda.paga"];

const EXTERNAL_KEYS = [
  "codigo_lancamento_omie",
  "nCodTitulo",
  "codigo_lancamento",
  "id",
  "id_venda",
  "sale_id",
  "external_id",
  "numero_documento"
];

function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 10 || value == null) return out;
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return out;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, out, depth + 1);
    }
  }
  return out;
}

function payloadLayers(root: Record<string, unknown>): Record<string, unknown>[] {
  const layers: Record<string, unknown>[] = [root];
  for (const key of ["event", "dados", "data", "resource", "payload", "body"]) {
    const v = root[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      layers.push(v as Record<string, unknown>);
    }
  }
  return layers;
}

function firstPvReceivableId(strings: string[]): string | undefined {
  for (const s of strings) {
    const m = s.match(PV_INTEGRATION_RE);
    if (m) return m[1].toLowerCase();
  }
  return undefined;
}

function eventLabelFromPayload(payload: Record<string, unknown>): string | undefined {
  const keys = ["evento", "event", "topic", "type", "acao", "action", "name"];
  for (const layer of payloadLayers(payload)) {
    for (const key of keys) {
      const v = layer[key];
      if (typeof v === "string" && v.trim()) return v.trim().toLowerCase();
    }
  }
  return undefined;
}

function externalIdFromLayers(layers: Record<string, unknown>[]): string | undefined {
  for (const layer of layers) {
    for (const key of EXTERNAL_KEYS) {
      const v = layer[key];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number" && Number.isFinite(v)) return String(v);
    }
  }
  return undefined;
}

function looksPaid(label: string | undefined, blob: string): boolean {
  const hay = `${label ?? ""} ${blob}`.toLowerCase();
  return PAID_HINTS.some((hint) => hay.includes(hint));
}

function providerPaidTopic(provider: Provider | "generic", label: string | undefined): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  if (provider === "omie") return OMIE_PAID_TOPIC_PARTS.some((p) => l.includes(p));
  if (provider === "conta_azul") return CA_PAID_TOPIC_PARTS.some((p) => l.includes(p));
  return false;
}

function resolveKind(
  provider: Provider | "generic",
  label: string | undefined,
  blob: string,
  receivableInternalId?: string,
  externalId?: string
): WebhookEventKind {
  if (providerPaidTopic(provider, label) || looksPaid(label, blob)) {
    return "receivable_paid";
  }
  if (receivableInternalId || externalId) {
    return "receivable_updated";
  }
  return "unknown";
}

/** Extrai sinais de baixa/liquidação e referência PV- / ID externo do payload do webhook. */
export function parseWebhookPayload(provider: Provider | "generic", payload: unknown): ParsedWebhookEvent {
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const layers = payloadLayers(root);
  const strings = collectStrings(root);
  const blob = strings.join(" ").toLowerCase();
  const eventLabel = eventLabelFromPayload(root);
  const receivableInternalId = firstPvReceivableId(strings);
  const integrationCode = receivableInternalId ? `PV-${receivableInternalId}` : undefined;
  const externalId = externalIdFromLayers(layers);

  const kind = resolveKind(provider, eventLabel, blob, receivableInternalId, externalId);

  if (provider === "generic" && kind === "unknown" && !receivableInternalId && !externalId) {
    return { kind: "unknown", eventLabel };
  }

  return {
    kind,
    integrationCode,
    receivableInternalId,
    externalId,
    eventLabel: eventLabel ?? provider
  };
}
