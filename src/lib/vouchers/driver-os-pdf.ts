import { SimplePdf, jpegInfo, wrap as wrapF, type RGB } from "../pdf/simple-pdf.ts";

/**
 * Solicitação de serviço ao motorista (O.S. em PDF anexada ao e-mail), no formato de voucher de fornecedor.
 * NUNCA traz o nome do cliente final: o motorista vê só "Corrida empresarial" / "Corrida particular".
 * Função pura, testável.
 */
export type DriverOsData = {
  number: string;
  version: "nova" | "atualizada";
  issuedAt: string;
  company: { name: string; cnpj: string; address?: string | null; phone?: string | null; email?: string | null };
  driverName: string;
  driverPhone?: string | null;
  when: string;
  city?: string | null;
  service: string;
  /** "Corrida empresarial" ou "Corrida particular" — no lugar do nome do cliente. */
  kindLabel: string;
  passenger: string;
  passengerPhone?: string | null;
  origin: string;
  destination: string;
  stops?: { name: string; address: string }[];
  flight?: string | null;
  presentation?: string | null;
  vehicle?: string | null;
  notes?: string | null;
  /** Só parceiro: valor estimado e data prevista. Funcionário: não aparece. */
  pay?: { amount: string; forecast?: string | null } | null;
  appUrl: string;
  /** Logo da Prime em JPEG (Configurações). Sem logo, fica só o nome. */
  logo?: Uint8Array | null;
  centralPhones?: string | null;
};

function rgb(h: string): RGB {
  const x = h.replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
}

const INK = "#111111";
const GOLD = "#C9A84C";
const BAR = "#1A1A1A";
const GRID = "#CFC8B5";
const MUTED = "#6B6F76";

/** Tira cidade e UF do fim do endereço: "..., Vitória - ES" → "Vitória / ES". */
export function cityFromAddress(text: string | null | undefined): string | null {
  const m = String(text ?? "").match(/([A-Za-zÀ-ÿ' .]+?)\s*[-/]\s*([A-Z]{2})(?:,\s*\d{5}-?\d{3})?(?:,?\s*Brasil)?\s*$/);
  return m ? `${m[1].trim().split(",").pop()?.trim()} / ${m[2]}` : null;
}

export function buildDriverOsPdf(d: DriverOsData): Uint8Array {
  const pdf = new SimplePdf();
  const L = 32;
  const R = 563;
  const W = R - L;
  const T = (s: string, x: number, y: number, size = 9, o: { bold?: boolean; color?: string; align?: "left" | "right" } = {}) =>
    pdf.text(s, x, y, { font: o.bold ? "B" : "R", size, color: rgb(o.color ?? INK), align: o.align });
  const wrap = (s: string, size: number, w: number, bold = false) => wrapF(s, bold ? "B" : "R", size, w);
  let y = 0;

  // Cabeçalho da Prime: logo + nome + linha de serviço.
  pdf.rect(0, 0, 595.28, 82, rgb("#0B0B0B"));
  pdf.rect(0, 82, 595.28, 2.5, rgb(GOLD));
  let tx = L;
  if (d.logo) {
    try {
      pdf.roundRect(L, 11, 60, 60, 8, rgb("#FFFFFF"));
      // Mantém a proporção da logo dentro do quadro branco.
      const info = jpegInfo(d.logo);
      const k = info ? Math.min(56 / info.w, 56 / info.h) : 1;
      const w = info ? info.w * k : 56;
      const h = info ? info.h * k : 56;
      pdf.image(d.logo, L + 2 + (56 - w) / 2, 13 + (56 - h) / 2, w, h);
      tx = L + 72;
    } catch {
      tx = L;
    }
  }
  T("PRIME VITÓRIA", tx, 38, 19, { bold: true, color: "#FFFFFF" });
  T("TRANSPORTE EXECUTIVO · MOBILIDADE CORPORATIVA", tx, 53, 7.5, { bold: true, color: GOLD });
  T("Central 24h", R, 28, 9, { bold: true, color: GOLD, align: "right" });
  const phones = (d.centralPhones || d.company.phone || "(27) 2142-8307").split("|").map((x) => x.trim());
  phones.forEach((ph, i) => T(ph, R, 42 + i * 12, 9, { color: "#FFFFFF", align: "right" }));
  T(d.company.email || "contato@primevitoria.com", R, 42 + phones.length * 12 + 2, 8, { color: "#CCCCCC", align: "right" });
  y = 100;
  T(`CNPJ ${d.company.cnpj} | ${d.company.name}${d.company.address ? ` | ${d.company.address}` : ""}`, L, y, 7, { color: MUTED });

  y += 20;
  T(`SOLICITAÇÃO DE SERVIÇO AO MOTORISTA Nº ${d.number}`, L, y, 11, { bold: true });
  if (d.version === "atualizada") {
    y += 16;
    pdf.rect(L, y - 11, W, 16, rgb("#FFF4D6"));
    T(`ATUALIZADA em ${d.issuedAt} — esta solicitação substitui a anterior. Confira horário, endereços e passageiros.`, L + 6, y, 8.5, {
      bold: true,
      color: "#8A5A00"
    });
  } else {
    y += 14;
    T(`Emitida em ${d.issuedAt}`, L, y, 8, { color: MUTED });
  }

  y += 18;
  for (const ln of wrap(
    "Este serviço foi atribuído a você pela Prime Vitória. Consulte as informações abaixo e siga as orientações da Ordem de Serviço.",
    8.5,
    W
  )) {
    T(ln, L, y, 8.5);
    y += 11;
  }
  y += 4;
  T(`MOTORISTA: ${d.driverName}${d.driverPhone ? ` · ${d.driverPhone}` : ""}`, L, y, 8.5, { bold: true });
  y += 18;

  // Grade no estilo do voucher de fornecedor.
  const half = W / 2;
  const bar = (cols: [string, number, number][]) => {
    pdf.rect(L, y, W, 13, rgb(BAR));
    for (const [label, x] of cols) T(label, L + x + 4, y + 9.5, 7.5, { bold: true, color: "#FFFFFF" });
    y += 13;
  };
  const cell = (rows: [string, number, number][], size = 8.5, bold = false) => {
    const wrapped = rows.map(([text, , w]) => wrap(text || "-", size, w - 8, bold));
    const h = Math.max(...wrapped.map((l) => l.length)) * (size + 2.5) + 6;
    pdf.rect(L, y, W, h, rgb("#FFFFFF"), rgb(GRID), 0.5);
    rows.forEach(([, x], i) => {
      if (x > 0) pdf.line(L + x, y, L + x, y + h, rgb(GRID), 0.5);
      wrapped[i].forEach((ln, k) => T(ln, L + x + 4, y + 9 + k * (size + 2.5), size, { bold }));
    });
    y += h;
  };

  bar([["Data / horário", 0, 0], ["Cidade", 150, 0], ["Tipo / Serviço", 290, 0]]);
  cell([[d.when, 0, 150], [d.city ?? "-", 150, 140], [`${d.service} · ${d.kindLabel}`, 290, W - 290]], 9, true);
  if (d.presentation || d.flight) {
    bar([["Chegar no local", 0, 0], ["Voo", half, 0]]);
    cell([[d.presentation ?? "-", 0, half], [d.flight ?? "-", half, half]]);
  }
  bar([["Origem", 0, 0], ["Destino", half, 0]]);
  cell([[d.origin, 0, half], [d.destination, half, half]]);
  if (d.stops?.length) {
    bar([["Paradas (na ordem)", 0, 0]]);
    cell([[d.stops.map((s, i) => `${i + 1}. ${s.name} — ${s.address}`).join("\n"), 0, W]]);
  }
  bar([["Passageiros", 0, 0], ["Atendimento", half, 0]]);
  cell([[d.passengerPhone ? `${d.passenger} [${d.passengerPhone}]` : d.passenger, 0, half], [d.kindLabel, half, half]]);
  bar([["Observações do serviço", 0, 0]]);
  cell([[d.notes || "-", 0, W]]);
  bar([["Veículo / Tipo", 0, 0], ["Motorista", half, 0]]);
  cell([[d.vehicle || "-", 0, half], [d.driverName, half, half]]);
  if (d.pay) {
    bar([["Forma de pagamento", 0, 0], ["Tipo", 150, 0], ["Valor (estimado)", 290, 0], ["Pagamento previsto", 410, 0]]);
    cell([["Repasse ao motorista", 0, 150], ["Faturado", 150, 140], [d.pay.amount, 290, 120], [d.pay.forecast ?? "-", 410, W - 410]], 9, true);
  }

  y += 16;
  T("INFORMAÇÕES IMPORTANTES:", L, y, 8.5, { bold: true });
  y += 12;
  const info = [
    "Confirme a corrida no app e esteja no local no horário de chegada indicado. Qualquer imprevisto, avise a Central IMEDIATAMENTE.",
    "Os dados do cliente e do passageiro são confidenciais: não faça contato comercial nem ofereça serviços diretamente.",
    "No app: inicie com o KM do painel, mantenha o app aberto na tela durante a corrida e finalize com o KM final.",
    d.pay
      ? "Valor estimado: pode mudar com km real, hora parada ou alteração do serviço. A Prime paga o repasse depois que o cliente paga; se o cliente atrasar, o repasse atrasa junto."
      : null,
    `App do motorista: ${d.appUrl}`
  ].filter(Boolean) as string[];
  for (const p of info) {
    for (const ln of wrap(`• ${p}`, 8, W)) {
      T(ln, L, y, 8);
      y += 10.5;
    }
  }

  // Informações para fechamento (o app já registra; o papel fica de reserva).
  if (y < 720) {
    y += 10;
    T("Informações para fechamento (o app registra sozinho; use se o app falhar)", L, y, 8, { bold: true });
    y += 14;
    const blanks = ["Início ___/___ ___:___", "Término ___/___ ___:___", "KM inicial ________", "KM final ________"];
    blanks.forEach((b, i) => T(b, L + i * (W / 4), y, 8.5));
    y += 16;
    T("Gastos extras (pedágio, estacionamento): ______________________________________________", L, y, 8.5);
  }

  pdf.line(L, 810, R, 810, rgb(GOLD), 0.8);
  T(`${d.company.name} · CNPJ ${d.company.cnpj}${d.company.email ? ` · ${d.company.email}` : ""}`, L, 822, 7, { color: MUTED });
  return pdf.toBytes();
}
