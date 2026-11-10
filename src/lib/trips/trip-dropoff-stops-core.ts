/** Regras puras da lista de passageiros (sem dependências, testável). */
export type DropoffStop = {
  passenger_id?: string | null;
  passenger_name: string;
  /** Telefone de quem desce aqui (a central e o motorista ligam se não achar a pessoa). */
  passenger_phone?: string | null;
  address_text: string;
  lat?: number | null;
  lng?: number | null;
  dropped_at?: string | null;
  /** Última pessoa: fica no destino final da corrida. */
  final?: boolean | null;
};

export function nextPendingDropoffIndex(stops: DropoffStop[]): number | null {
  const i = stops.findIndex((s) => !s.dropped_at);
  return i >= 0 ? i : null;
}

export function markDropoff(stops: DropoffStop[], index: number, at = new Date().toISOString()): DropoffStop[] {
  if (index < 0 || index >= stops.length || stops[index].dropped_at) return stops;
  return stops.map((s, i) => (i === index ? { ...s, dropped_at: at } : s));
}

/** Ao finalizar a corrida, quem ainda não foi marcado desce no destino final. */
export function closeAllDropoffs(stops: DropoffStop[], at = new Date().toISOString()): DropoffStop[] {
  return stops.map((s) => (s.dropped_at ? s : { ...s, dropped_at: at }));
}

/** "Marlene, Vivian e Suzana" para o campo de passageiro da corrida. */
export function passengerSummary(stops: DropoffStop[]): string {
  const names = stops.map((s) => s.passenger_name.trim().split(/\s+/)[0]).filter(Boolean);
  if (names.length <= 1) return stops[0]?.passenger_name ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export function moveDropoff(stops: DropoffStop[], from: number, to: number): DropoffStop[] {
  if (from === to || from < 0 || to < 0 || from >= stops.length || to >= stops.length) return stops;
  const next = [...stops];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
