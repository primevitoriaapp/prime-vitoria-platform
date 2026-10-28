/**
 * Modelos de mensagem de WhatsApp da Prime Vitória (textos padrão + regras).
 * Sem acesso a banco: usado no painel, na API e nos testes.
 */

export type MessageAudience = "passageiro" | "solicitante" | "motorista" | "operador";

export type MessageEventId =
  | "solicitacao_recebida"
  | "corrida_confirmada"
  | "motorista_atribuido"
  | "lembrete"
  | "motorista_chegou"
  | "alteracao"
  | "cancelamento"
  | "os_motorista"
  | "novo_pedido";

export type MessageEventDef = {
  id: MessageEventId;
  label: string;
  when: string;
  defaults: Partial<Record<MessageAudience, string>>;
};

export const AUDIENCE_LABEL: Record<MessageAudience, string> = {
  passageiro: "Passageiro",
  solicitante: "Quem pediu a corrida",
  motorista: "Motorista",
  operador: "Operador (você)"
};

export const MESSAGE_EVENTS: readonly MessageEventDef[] = [
  {
    id: "solicitacao_recebida",
    label: "Pedido recebido",
    when: "Quando o cliente pede uma corrida pelo portal.",
    defaults: {
      solicitante:
        "Olá, {nome}! Recebemos seu pedido para {data} às {horario}, de {origem} para {destino}. Estamos preparando seu atendimento e já confirmamos o motorista. Prime Vitória."
    }
  },
  {
    id: "corrida_confirmada",
    label: "Corrida confirmada",
    when: "Quando a central aceita o pedido.",
    defaults: {
      solicitante:
        "Sua corrida de {data} às {horario} está confirmada. Estamos organizando o veículo e avisamos assim que o motorista for definido. Prime Vitória."
    }
  },
  {
    id: "motorista_atribuido",
    label: "Motorista definido",
    when: "Quando a central atribui o motorista.",
    defaults: {
      solicitante:
        "Tudo pronto, {nome}! Pedido confirmado para {data} às {horario}. Quem vai atender {passageiro} é {motorista}, em um {veiculo} {cor}, placa {placa}. Qualquer dúvida, estamos à disposição. Prime Vitória.",
      passageiro:
        "Olá, {nome}! Tudo bem? Somos da Prime Vitória, responsável pelo seu atendimento. Seguem as informações do serviço agendado:\n📅 {data} às {horario}\n📍 {origem} → {destino}\n🚘 Motorista: {motorista} {telefone_motorista}\n{veiculo} {cor} · placa {placa}\nBoa viagem!"
    }
  },
  {
    id: "lembrete",
    label: "Lembrete",
    when: "Na véspera ou algumas horas antes da corrida.",
    defaults: {
      passageiro:
        "Olá, {nome}! Seu transfer Prime Vitória está confirmado.\n📅 {data} às {horario}\n📍 {origem} → {destino}\n🚘 {motorista} · {veiculo} {cor} · placa {placa}",
      motorista:
        "Lembrete, {nome}: corrida {numero} em {data} às {horario}, embarque em {origem}. Passageiro: {passageiro}."
    }
  },
  {
    id: "motorista_chegou",
    label: "Motorista chegou",
    when: "Quando o motorista marca que chegou ao local.",
    defaults: {
      passageiro: "{nome}, seu motorista {motorista} já está no local de embarque ({veiculo} {cor}, placa {placa})."
    }
  },
  {
    id: "alteracao",
    label: "Corrida alterada",
    when: "Quando data, horário ou trajeto mudam.",
    defaults: {
      passageiro: "{nome}, sua corrida foi atualizada: {data} às {horario}, de {origem} para {destino}. Prime Vitória.",
      solicitante: "A corrida {numero} foi atualizada: {data} às {horario}, de {origem} para {destino}. Prime Vitória.",
      motorista: "Atualização da corrida {numero}: {data} às {horario}, de {origem} para {destino}. Passageiro: {passageiro}."
    }
  },
  {
    id: "cancelamento",
    label: "Corrida cancelada",
    when: "Quando a corrida é cancelada.",
    defaults: {
      passageiro: "{nome}, a corrida de {data} às {horario} foi cancelada. Qualquer dúvida, fale com a central Prime Vitória.",
      solicitante: "A corrida {numero} de {data} às {horario} foi cancelada. Prime Vitória.",
      motorista: "Corrida {numero} de {data} às {horario} CANCELADA. Não é preciso comparecer."
    }
  },
  {
    id: "os_motorista",
    label: "Ordem de serviço ao motorista",
    when: "Quando a corrida é enviada ao motorista.",
    defaults: {
      motorista:
        "*ORDEM DE SERVIÇO {numero}*\n📅 {data} às {horario}\n📍 Embarque: {origem}\n🏁 Destino: {destino}\n👤 Passageiro: {passageiro} {telefone_passageiro}\n📝 {observacoes}{linha_valor_parceiro}\nConfirme o recebimento respondendo OK."
    }
  },
  {
    id: "novo_pedido",
    label: "Novo pedido (aviso para você)",
    when: "Quando entra um pedido pelo portal.",
    defaults: {
      operador: "Nova corrida de {empresa}: {data} às {horario}, {origem} → {destino}. Passageiro: {passageiro}."
    }
  }
] as const;

export const TEMPLATE_VARIABLES: ReadonlyArray<{ key: string; label: string }> = [
  { key: "nome", label: "Nome de quem recebe" },
  { key: "passageiro", label: "Passageiro(s)" },
  { key: "telefone_passageiro", label: "Telefone do passageiro" },
  { key: "empresa", label: "Empresa cliente" },
  { key: "numero", label: "Número da corrida" },
  { key: "data", label: "Data" },
  { key: "horario", label: "Horário" },
  { key: "origem", label: "Embarque" },
  { key: "destino", label: "Destino" },
  { key: "motorista", label: "Motorista" },
  { key: "telefone_motorista", label: "Telefone do motorista" },
  { key: "veiculo", label: "Veículo" },
  { key: "cor", label: "Cor" },
  { key: "placa", label: "Placa" },
  { key: "observacoes", label: "Observações" },
  { key: "linha_valor_parceiro", label: "Repasse (só parceiro)" }
];

export type TemplateVars = Partial<Record<string, string | null | undefined>>;

/** Troca {variavel} pelo valor; variável vazia some sem deixar espaço duplo. */
export function renderTemplate(body: string, vars: TemplateVars): string {
  const out = body.replace(/\{([a-z_]+)\}/g, (_m, key: string) => {
    const v = vars[key];
    return v == null ? "" : String(v).trim();
  });
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trimEnd())
    .join("\n")
    .trim();
}

export function defaultTemplate(event: MessageEventId, audience: MessageAudience): string | null {
  return MESSAGE_EVENTS.find((e) => e.id === event)?.defaults[audience] ?? null;
}

/** Só dígitos com DDI 55 para link do WhatsApp; null se não parecer telefone. */
export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const p = normalizeWhatsappPhone(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export function partnerValueLine(employmentType: string | null | undefined, driverAmount: number | null | undefined): string {
  if (employmentType === "funcionario") return "";
  if (driverAmount == null || !Number.isFinite(Number(driverAmount)) || Number(driverAmount) <= 0) return "";
  const v = Number(driverAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `\n💰 Seu repasse: ${v}`;
}
