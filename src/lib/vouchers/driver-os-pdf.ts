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
  /** true: as paradas são os embarques (busca de vários passageiros) e a primeira é o embarque. */
  stopsArePickups?: boolean;
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
  const LABEL = "#7A6A3A";
  const LINE = "#EEE9DC";

  // Cabeçalho no padrão da fatura: logo + empresa à esquerda, documento e número à direita.
  pdf.rect(0, 0, 595.28, 96, rgb("#0B0B0B"));
  pdf.rect(0, 96, 595.28, 3, rgb(GOLD));
  let tx = L;
  if (d.logo) {
    try {
      const info = jpegInfo(d.logo);
      const k = info ? Math.min(70 / info.w, 70 / info.h) : 1;
      const w = info ? info.w * k : 70;
      const h = info ? info.h * k : 70;
      pdf.roundRect(L, 13, w + 4, h + 4, 6, rgb("#FFFFFF"));
      pdf.image(d.logo, L + 2, 15, w, h);
      tx = L + w + 16;
    } catch {
      tx = L;
    }
  }
  if (tx === L) T("PRIME VITÓRIA", tx, 30, 18, { bold: true, color: "#FFFFFF" });
  T("TRANSPORTE EXECUTIVO · MOBILIDADE CORPORATIVA", tx, tx === L ? 44 : 30, 7.5, { bold: true, color: GOLD });
  T(d.company.name, tx, tx === L ? 58 : 46, 9.5, { bold: true, color: "#FFFFFF" });
  T(`CNPJ ${d.company.cnpj}`, tx, tx === L ? 70 : 58, 8, { color: "#BBBBBB" });
  T(`${d.company.email || "contato@primevitoria.com"} · ${d.centralPhones || d.company.phone || "(27) 2142-8307"}`, tx, tx === L ? 82 : 70, 8, { color: "#BBBBBB" });
  T("ORDEM DE SERVIÇO", R, 30, 8, { color: "#BBBBBB", align: "right" });
  T(`Nº ${d.number}`, R, 50, 17, { bold: true, color: GOLD, align: "right" });
  T(d.version === "atualizada" ? "ATUALIZADA" : `Emitida em ${d.issuedAt}`, R, 64, 8, { bold: d.version === "atualizada", color: d.version === "atualizada" ? GOLD : "#DDDDDD", align: "right" });

  let y = 118;
  if (d.version === "atualizada") {
    pdf.rect(L, y - 11, W, 16, rgb("#FFF4D6"));
    T(`ATUALIZADA em ${d.issuedAt}: substitui a anterior. Confira horário, endereços e passageiros.`, L + 6, y, 8.5, { bold: true, color: "#8A5A00" });
    y += 18;
  }
  for (const ln of wrap("Este serviço foi atribuído a você pela Prime Vitória. Consulte as informações abaixo e siga as orientações da Ordem de Serviço.", 8.5, W)) {
    T(ln, L, y, 8.5, { color: "#444444" });
    y += 11;
  }
  y += 8;

  // Quadro de informações (rótulo pequeno + valor), 4 por linha, como na fatura.
  const cards = (items: [string, string | null | undefined][]) => {
    const list = items.filter(([, v]) => v);
    const cw = W / 4;
    for (let i = 0; i < list.length; i += 4) {
      const row = list.slice(i, i + 4);
      const lines = row.map(([, v]) => wrap(String(v), 9.5, cw - 10, true));
      const h = 16 + Math.max(...lines.map((l) => l.length)) * 12;
      row.forEach(([label], k) => {
        const x = L + k * cw;
        T(label.toUpperCase(), x, y, 7, { color: LABEL });
        lines[k].forEach((ln, j) => T(ln, x, y + 13 + j * 12, 9.5, { bold: true }));
      });
      y += h;
    }
  };
  cards([
    ["Data e horário", d.when],
    ["Chegar no local", d.presentation],
    ["Serviço", d.service],
    ["Atendimento", d.kindLabel],
    ["Motorista", `${d.driverName}${d.driverPhone ? ` · ${d.driverPhone}` : ""}`],
    ["Veículo", d.vehicle || "A definir"],
    ["Voo", d.flight],
    ["Cidade", d.city]
  ]);
  y += 6;

  // Tabela do serviço (mesmo desenho do relatório da fatura).
  T("SERVIÇO", L, y, 9, { bold: true });
  y += 10;
  const cols: { label: string; w: number; align?: "right" }[] = [
    { label: "PASSAGEIRO(S)", w: 120 },
    { label: "TRAJETO (EMBARQUE » PARADAS » DESTINO)", w: d.pay ? W - 120 - 85 : W - 120 },
    ...(d.pay ? [{ label: "REPASSE", w: 85, align: "right" as const }] : [])
  ];
  let cx = L;
  for (const c of cols) {
    T(c.label, c.align === "right" ? cx + c.w - 4 : cx + 4, y + 9, 7, { color: LABEL, align: c.align });
    cx += c.w;
  }
  y += 14;
  pdf.line(L, y, R, y, rgb(GOLD), 1.5);

  const tw = cols[1].w - 8;
  const routeLines: { text: string; bold?: boolean; muted?: boolean }[] = [];
  const point = (mark: string, address: string, who?: string | null, strong = false) => {
    wrap(`${mark} ${address}`, 8.5, tw).forEach((ln, i) => routeLines.push({ text: i ? `   ${ln}` : ln, bold: strong || mark === "•" }));
    if (who) routeLines.push({ text: `   ${who}`, muted: true });
  };
  const stops = d.stops ?? [];
  if (d.stopsArePickups && stops.length) {
    stops.forEach((st, i) => point(i === 0 ? "•" : "»", st.address, st.name));
  } else {
    point("•", d.origin);
    stops.forEach((st) => point("»", st.address, st.name));
  }
  point("»", d.destination, null, true);

  const paxLines = [
    ...wrap(d.passenger || "-", 8.5, cols[0].w - 8, true),
    ...(d.passengerPhone ? wrap(d.passengerPhone, 8, cols[0].w - 8) : [])
  ];
  const rowH = Math.max(routeLines.length * 11, paxLines.length * 11, d.pay ? 26 : 0) + 10;
  let ry = y + 12;
  paxLines.forEach((ln, i) => T(ln, L + 4, ry + i * 11, i < paxLines.length - (d.passengerPhone ? 1 : 0) ? 8.5 : 8, { bold: i === 0, color: i > 0 && d.passengerPhone && i === paxLines.length - 1 ? MUTED : INK }));
  routeLines.forEach((ln, i) => T(ln.text, L + cols[0].w + 4, ry + i * 11, ln.muted ? 7.5 : 8.5, { bold: ln.bold, color: ln.muted ? MUTED : INK }));
  if (d.pay) {
    T(d.pay.amount, R - 4, ry, 9.5, { bold: true, align: "right" });
    if (d.pay.forecast) T(`previsto ${d.pay.forecast}`, R - 4, ry + 12, 7.5, { color: MUTED, align: "right" });
  }
  y += rowH;
  pdf.line(L, y, R, y, rgb(LINE), 0.8);
  y += 16;

  if (d.notes) {
    const lines = wrap(d.notes, 8.5, W - 20);
    const h = lines.length * 11 + 20;
    pdf.roundRect(L, y, W, h, 6, rgb("#F8F5EE"), rgb("#EAE4D6"), 0.6);
    T("OBSERVAÇÕES", L + 10, y + 12, 7, { color: LABEL });
    lines.forEach((ln, i) => T(ln, L + 10, y + 24 + i * 11, 8.5));
    y += h + 14;
  }

  T("INFORMAÇÕES IMPORTANTES", L, y, 8, { bold: true, color: LABEL });
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

  if (y < 730) {
    y += 12;
    T("PARA FECHAMENTO (o app registra sozinho; use se o app falhar)", L, y, 7.5, { bold: true, color: LABEL });
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
