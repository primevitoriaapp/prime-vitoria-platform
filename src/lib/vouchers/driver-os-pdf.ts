import { SimplePdf, wrap as wrapF, type RGB } from "../pdf/simple-pdf.ts";

/** Adaptador para o gerador de PDF do sistema (cores em hex, y a partir do topo). */
function rgb(h: string): RGB {
  const x = h.replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
}
class Doc {
  pdf = new SimplePdf();
  text(x: number, y: number, s: string, size = 10, o: { bold?: boolean; color?: string } = {}) {
    this.pdf.text(s, x, y, { font: o.bold ? "B" : "R", size, color: rgb(o.color ?? "#111111") });
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    this.pdf.rect(x, y, w, h, rgb(c));
  }
  line(x1: number, y1: number, x2: number, y2: number, c = "#E7E2D3", lw = 0.8) {
    this.pdf.line(x1, y1, x2, y2, rgb(c), lw);
  }
  addPage() {
    this.pdf.addPage();
  }
  toBytes() {
    return this.pdf.toBytes();
  }
}
const wrap = (text: string, size: number, maxWidth: number, bold = false) => wrapF(text, bold ? "B" : "R", size, maxWidth);

/** Ordem de serviço / voucher do motorista (PDF anexado ao e-mail). Função pura, testável. */
export type DriverOsData = {
  number: string;
  version: "nova" | "atualizada";
  issuedAt: string; // texto pronto, ex.: "03/11/2026 23:50"
  company: { name: string; cnpj: string; address?: string | null; phone?: string | null; email?: string | null };
  when: string;
  service: string;
  clientName: string;
  passenger: string;
  passengerPhone?: string | null;
  origin: string;
  destination: string;
  stops?: { name: string; address: string }[];
  flight?: string | null;
  presentation?: string | null;
  vehicle?: string | null;
  driverName: string;
  notes?: string | null;
  /** Só parceiro: valor estimado e data prevista. Funcionário: não aparece. */
  pay?: { amount: string; forecast?: string | null } | null;
  appUrl: string;
};

const GOLD = "#C9A84C";
const INK = "#111111";
const MUTED = "#6B6F76";

export function buildDriverOsPdf(d: DriverOsData): Uint8Array {
  const pdf = new Doc();
  const L = 40;
  const R = 555;
  const W = R - L;

  // Cabeçalho preto com a marca.
  pdf.rect(0, 0, 595.28, 92, "#0B0B0B");
  pdf.text(L, 40, "PRIME", 22, { bold: true, color: "#FFFFFF" });
  pdf.text(L + 82, 40, "VITÓRIA", 22, { bold: true, color: GOLD });
  pdf.text(L, 58, "TRANSPORTE EXECUTIVO", 8, { color: GOLD });
  pdf.text(L, 76, `${d.company.name} · CNPJ ${d.company.cnpj}`, 8.5, { color: "#DDDDDD" });
  pdf.text(R - 170, 40, d.version === "atualizada" ? "ORDEM DE SERVIÇO" : "ORDEM DE SERVIÇO", 11, { bold: true, color: "#FFFFFF" });
  pdf.text(R - 170, 56, `Nº ${d.number}`, 11, { bold: true, color: GOLD });
  pdf.text(R - 170, 72, d.version === "atualizada" ? `ATUALIZADA em ${d.issuedAt}` : `Emitida em ${d.issuedAt}`, 8, {
    color: d.version === "atualizada" ? "#FFD27A" : "#CCCCCC",
    bold: d.version === "atualizada"
  });

  let y = 122;
  if (d.version === "atualizada") {
    pdf.rect(L, y - 14, W, 22, "#FFF4D6");
    pdf.text(L + 10, y, "Esta O.S. substitui a anterior: confira horário, endereços e passageiros.", 9.5, { bold: true, color: "#8A5A00" });
    y += 26;
  }

  // Data/hora em destaque.
  pdf.text(L, y, "DATA E HORÁRIO", 8, { color: MUTED });
  pdf.text(L, y + 18, d.when, 16, { bold: true, color: INK });
  pdf.text(L + 300, y, "SERVIÇO", 8, { color: MUTED });
  wrap(d.service, 11, W - 300, true).slice(0, 2).forEach((ln, i) => pdf.text(L + 300, y + 16 + i * 13, ln, 11, { bold: true }));
  y += 44;
  pdf.line(L, y, R, y, GOLD, 1.2);
  y += 20;

  const row = (label: string, value: string | null | undefined) => {
    if (!value) return;
    if (y > 740) {
      pdf.addPage();
      y = 50;
    }
    const lines = wrap(value, 10.5, W - 130);
    pdf.text(L, y, label.toUpperCase(), 8, { color: "#7A6A3A" });
    lines.forEach((ln, i) => pdf.text(L + 130, y + i * 14, ln, 10.5));
    y += Math.max(1, lines.length) * 14 + 6;
    pdf.line(L, y - 4, R, y - 4);
    y += 6;
  };

  row("Cliente", d.clientName);
  row("Passageiro", d.passengerPhone ? `${d.passenger} · ${d.passengerPhone}` : d.passenger);
  row("Embarque", d.origin);
  if (d.presentation) row("Chegar no local", d.presentation);
  if (d.stops?.length) d.stops.forEach((s, i) => row(`Parada ${i + 1}`, `${s.name} — ${s.address}`));
  row("Destino", d.destination);
  row("Voo", d.flight ?? null);
  row("Motorista", d.driverName);
  row("Veículo", d.vehicle ?? null);
  row("Observações", d.notes ?? null);

  if (d.pay) {
    y += 6;
    pdf.rect(L, y - 4, W, 46, "#F4FAF6");
    pdf.text(L + 12, y + 12, "VOCÊ RECEBE (ESTIMATIVA)", 8, { color: "#1F7A4C" });
    pdf.text(L + 12, y + 32, d.pay.amount, 16, { bold: true, color: INK });
    if (d.pay.forecast) {
      pdf.text(L + 260, y + 12, "PAGAMENTO PREVISTO", 8, { color: "#1F7A4C" });
      pdf.text(L + 260, y + 32, d.pay.forecast, 13, { bold: true });
    }
    y += 54;
    wrap(
      "Valor estimado: pode mudar com km real, hora parada ou alteração do serviço. A Prime paga o repasse depois que o cliente paga; se o cliente atrasar, o repasse atrasa junto.",
      8,
      W
    ).forEach((ln) => {
      pdf.text(L, y, ln, 8, { color: MUTED });
      y += 11;
    });
  }

  y += 14;
  pdf.text(L, y, "No app: iniciar com o KM do painel, manter o app aberto durante a corrida e finalizar com o KM final.", 8.5, { color: MUTED });
  y += 12;
  pdf.text(L, y, `App do motorista: ${d.appUrl}`, 8.5, { color: MUTED });

  // Rodapé com os dados da empresa.
  const foot = [d.company.name, `CNPJ ${d.company.cnpj}`, d.company.address, d.company.phone, d.company.email].filter(Boolean).join(" · ");
  pdf.line(L, 800, R, 800, GOLD, 0.8);
  wrap(foot, 7.5, W).slice(0, 2).forEach((ln, i) => pdf.text(L, 814 + i * 10, ln, 7.5, { color: MUTED }));

  return pdf.toBytes();
}
