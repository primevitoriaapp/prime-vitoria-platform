/**
 * Modelos oficiais (Meta) dos avisos ao passageiro. O texto aqui é exatamente o que vai
 * para aprovação na Meta; {{1}}, {{2}}… são preenchidos pelo sistema em cada corrida.
 * Sem banco: usado no painel (prévia), no envio e nos testes.
 */
export type PassengerNotifyKind = "confirmado" | "a_caminho" | "avaliacao";

export type PassengerTemplate = {
  kind: PassengerNotifyKind;
  /** Nome do modelo na Meta (minúsculas e _). */
  name: string;
  label: string;
  when: string;
  body: string;
  /** Botão com link: o sistema completa o final do endereço. */
  button?: { text: string; urlPrefix: string };
  /** Exemplo de preenchimento (vai junto no pedido de aprovação). */
  example: string[];
};

export const TRACK_URL_PREFIX = "https://central.primevitoria.com/r/";

export const PASSENGER_TEMPLATES: PassengerTemplate[] = [
  {
    kind: "confirmado",
    name: "prime_motorista_confirmado",
    label: "1. Motorista confirmado",
    when: "Véspera às 18h (ou na hora, se a corrida for marcada para o mesmo dia)",
    body:
      "Olá, {{1}}! Aqui é a Central Prime Vitória.\n\n" +
      "Seu atendimento {{2}} às {{3}} está confirmado.\n" +
      "🚘 Motorista: {{4}}\n" +
      "🚗 Veículo: {{5}} · placa {{6}}\n\n" +
      "Obrigado por escolher a Prime Vitória!",
    example: ["Catarina", "amanhã (14/11)", "19:00", "João Vitor", "Onix Premier preto", "SFW2E03"]
  },
  {
    kind: "a_caminho",
    name: "prime_motorista_a_caminho",
    label: "2. Motorista a caminho",
    when: "Quando o motorista toca em “Sair para buscar”",
    body: "Olá, {{1}}! Seu motorista {{2}} já está a caminho do embarque em {{3}}.\n🚗 {{4}} · placa {{5}}\n\nSe quiser, acompanhe o carro em tempo real pelo botão abaixo.",
    button: { text: "Acompanhar motorista", urlPrefix: TRACK_URL_PREFIX },
    example: ["Catarina", "João Vitor", "Tribunal Regional do Trabalho", "Onix Premier preto", "SFW2E03"]
  },
  {
    kind: "avaliacao",
    name: "prime_avaliacao_atendimento",
    label: "3. Avaliação",
    when: "Quando a corrida é finalizada (no máximo 1 pedido de avaliação por semana para a mesma pessoa)",
    body: "Olá, {{1}}! Obrigado por viajar com a Prime Vitória.\n\nComo foi seu atendimento com {{2}}? Sua avaliação leva menos de 1 minuto e nos ajuda a manter o padrão Prime.",
    button: { text: "Avaliar atendimento", urlPrefix: TRACK_URL_PREFIX },
    example: ["Catarina", "João Vitor"]
  }
];

export function passengerTemplate(kind: PassengerNotifyKind): PassengerTemplate {
  return PASSENGER_TEMPLATES.find((t) => t.kind === kind) as PassengerTemplate;
}

/** Texto final, como o passageiro vai ver (para a prévia e o registro). */
export function renderPassengerTemplate(kind: PassengerNotifyKind, params: string[], buttonSuffix?: string | null): string {
  const t = passengerTemplate(kind);
  const text = t.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
  return t.button ? `${text}\n\n[ ${t.button.text} → ${t.button.urlPrefix}${buttonSuffix ?? "…"} ]` : text;
}

/** "amanhã (14/11)", "hoje" ou "em 20/11", no fuso de Vitória. */
export function dayPhrase(scheduledAt: string, now = new Date()): string {
  const tz = "America/Sao_Paulo";
  const d = new Date(scheduledAt);
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  const ddmm = d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" });
  if (key(d) === key(now)) return "hoje";
  if (key(d) === key(new Date(now.getTime() + 86400000))) return `amanhã (${ddmm})`;
  return `em ${ddmm}`;
}

/**
 * Hora de mandar o "motorista confirmado": véspera às 18h (horário de Vitória).
 * Corrida marcada depois disso (ou no mesmo dia) → manda assim que tiver motorista.
 */
export function confirmSendAt(scheduledAt: string): Date {
  const d = new Date(scheduledAt);
  const day = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const eve = new Date(`${day}T18:00:00-03:00`);
  return new Date(eve.getTime() - 86400000);
}
