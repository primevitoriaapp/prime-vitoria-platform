export type InAppNotificationRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  status: string;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
};

export type InAppNotificationView = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  tripId: string | null;
  unread: boolean;
  createdAt: string;
  sentAt: string | null;
};

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function tripIdFrom(payload: Record<string, unknown>): string | null {
  const v = payload.tripId ?? payload.trip_id;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Textos PT-BR para eventos in-app conhecidos. */
export function presentInAppNotification(row: InAppNotificationRow): InAppNotificationView {
  const payload = payloadRecord(row.payload);
  const tripId = tripIdFrom(payload);
  const eventType = row.event_type;

  let title = "Notificação";
  let body = eventType;

  switch (eventType) {
    case "trip.completed":
      title = "Corrida concluída";
      body = tripId ? `A corrida ${tripId.slice(0, 8)}… foi finalizada.` : "Uma corrida foi finalizada.";
      break;
    case "finance.driver_payable_open":
      title = "Pagável motorista em aberto";
      body =
        payload.amount != null
          ? `Pagável de R$ ${Number(payload.amount).toFixed(2)} aguarda liquidação.`
          : "Novo pagável de motorista em aberto.";
      break;
    case "finance.accounts_receivable_open":
      title = "Conta a receber gerada";
      body = tripId
        ? `Nova conta a receber ligada à corrida ${tripId.slice(0, 8)}… (pós-corrida).`
        : "Nova conta a receber em aberto.";
      break;
    case "operations.trip_requested":
      title = "Nova solicitação de corrida";
      body = tripId ? `Corrida ${tripId.slice(0, 8)}… aguarda aprovação.` : "Nova corrida na fila operacional.";
      break;
    case "operations.trip_approved":
      title = "Corrida aprovada";
      body = tripId ? `Corrida ${tripId.slice(0, 8)}… pronta para despacho ou claim.` : "Corrida aprovada na fila.";
      break;
    case "operations.trip_claimed": {
      title = "Atendimento assumido";
      const who =
        typeof payload.claimer_name === "string" && payload.claimer_name.trim()
          ? payload.claimer_name.trim()
          : "Outro operador";
      body = tripId
        ? `${who} assumiu a corrida ${tripId.slice(0, 8)}….`
        : `${who} assumiu o atendimento de uma corrida.`;
      break;
    }
    case "operations.trip_dispatched": {
      title = "Corrida despachada";
      const mode = payload.dispatch_mode === "offer" ? "via oferta" : "despacho directo";
      body = tripId
        ? `Motorista atribuído (${mode}). Corrida ${tripId.slice(0, 8)}….`
        : `Nova atribuição de motorista (${mode}).`;
      break;
    }
    case "operations.trip_reassigned": {
      title = "Corrida reatribuída";
      body = tripId
        ? `Nova atribuição de motorista para a corrida ${tripId.slice(0, 8)}….`
        : "Corrida reatribuída a outro motorista.";
      break;
    }
    default:
      if (typeof payload.title === "string") title = payload.title;
      if (typeof payload.body === "string") body = payload.body;
      break;
  }

  return {
    id: row.id,
    eventType,
    title,
    body,
    tripId,
    unread: row.read_at == null,
    createdAt: row.created_at,
    sentAt: row.sent_at
  };
}
