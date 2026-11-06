import { SimplePdf, jpegInfo, wrap as wrapF, type RGB } from "../pdf/simple-pdf.ts";

/** Fatura detalhada em PDF (anexo do e-mail), no mesmo padrão da tela /fatura. Função pura. */
export type InvoicePdfRow = {
  when: string;
  ref: string;
  passenger: string;
  requester?: string | null;
  route: { address: string; who?: string | null }[];
  extra?: string | null;
  service: string;
  km: number | null;
  amount: number | null;
  /** Hora extra/espera cobrada (já somada em amount). */
  waitCharge?: { billable_minutes: number; amount: number } | null;
};

export type InvoicePdfData = {
  number: string;
  status: string;
  voucherRef?: string | null;
  issuer: { name: string; cnpj: string; contact: string };
  client: { name: string; tradeName?: string | null; document?: string | null; address?: string | null; email?: string | null };
  period: string;
  issueDate: string;
  dueDate: string;
  total: number;
  totalKm: number;
  tripCount: number;
  prepaid?: number;
  boletoLine?: string | null;
  nfNumber?: string | null;
  rows: InvoicePdfRow[];
  logo?: Uint8Array | null;
};

const INK: RGB = [17, 17, 17];
const GOLD: RGB = [201, 168, 76];
const LBL: RGB = [122, 106, 58];
const MUTED: RGB = [110, 110, 110];
const LINE: RGB = [238, 233, 220];
const WHITE: RGB = [255, 255, 255];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

export function fmtDocNumber(raw: string | null | undefined): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return String(raw ?? "");
}

export function buildInvoicePdf(d: InvoicePdfData): Uint8Array {
  const pdf = new SimplePdf();
  const L = 32;
  const R = pdf.W - 32;
  const W = R - L;
  const T = (s: string, x: number, y: number, size = 9, o: { bold?: boolean; color?: RGB; align?: "left" | "right" } = {}) =>
    pdf.text(s, x, y, { font: o.bold ? "B" : "R", size, color: o.color ?? INK, align: o.align });
  const wrap = (s: string, size: number, w: number, bold = false) => wrapF(s, bold ? "B" : "R", size, w);

  // Cabeçalho
  pdf.rect(0, 0, pdf.W, 96, [11, 11, 11]);
  pdf.rect(0, 96, pdf.W, 3, GOLD);
  let tx = L;
  if (d.logo) {
    try {
      const info = jpegInfo(d.logo);
      const k = info ? Math.min(70 / info.w, 70 / info.h) : 1;
      const w = info ? info.w * k : 70;
      const h = info ? info.h * k : 70;
      pdf.roundRect(L, 13, w + 4, h + 4, 6, WHITE);
      pdf.image(d.logo, L + 2, 15, w, h);
      tx = L + w + 16;
    } catch {
      tx = L;
    }
  }
  if (tx === L) T("PRIME VITÓRIA", tx, 30, 18, { bold: true, color: WHITE });
  const hy = tx === L ? 44 : 30;
  T("TRANSPORTE EXECUTIVO · MOBILIDADE CORPORATIVA", tx, hy, 7.5, { bold: true, color: GOLD });
  T(d.issuer.name, tx, hy + 16, 9.5, { bold: true, color: WHITE });
  T(`CNPJ ${fmtDocNumber(d.issuer.cnpj)}`, tx, hy + 28, 8, { color: [187, 187, 187] });
  T(d.issuer.contact, tx, hy + 40, 8, { color: [187, 187, 187] });
  T("FATURA", R, 28, 8, { color: [187, 187, 187], align: "right" });
  T(d.number, R, 50, 18, { bold: true, color: GOLD, align: "right" });
  if (d.voucherRef) T(`Voucher ${d.voucherRef}`, R, 64, 8.5, { color: [221, 221, 221], align: "right" });
  T(d.status, R, d.voucherRef ? 76 : 64, 8.5, { color: [221, 221, 221], align: "right" });

  // Cliente, período, vencimento, total
  let y = 122;
  const clientLines: { t: string; bold?: boolean }[] = [];
  wrap(d.client.name, 10, 250, true).forEach((t) => clientLines.push({ t, bold: true }));
  if (d.client.tradeName && d.client.tradeName !== d.client.name) clientLines.push({ t: d.client.tradeName });
  if (d.client.document) clientLines.push({ t: `${String(d.client.document).replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ"} ${fmtDocNumber(d.client.document)}` });
  if (d.client.address) wrap(d.client.address, 8.5, 250).forEach((t) => clientLines.push({ t }));
  if (d.client.email) clientLines.push({ t: d.client.email });
  T("CLIENTE (TOMADOR)", L, y, 7, { color: LBL });
  clientLines.forEach((l, i) => T(l.t, L, y + 13 + i * 11.5, l.bold ? 10 : 8.5, { bold: l.bold, color: l.bold ? INK : MUTED }));

  const cx = L + 270;
  T("PERÍODO", cx, y, 7, { color: LBL });
  T(d.period, cx, y + 13, 9.5, { bold: true });
  T(`Emitida em ${d.issueDate}`, cx, y + 25, 8, { color: MUTED });
  T("VENCIMENTO", cx, y + 44, 7, { color: LBL });
  T(d.dueDate, cx, y + 57, 9.5, { bold: true });

  const bx = R - 150;
  const prepaid = d.prepaid && d.prepaid > 0 ? d.prepaid : 0;
  const bh = prepaid ? 84 : 60;
  pdf.roundRect(bx, y - 10, 150, bh, 6, INK);
  T("TOTAL", bx + 12, y + 4, 7, { color: [187, 187, 187] });
  T(brl(d.total), bx + 12, y + 24, 16, { bold: true, color: GOLD });
  T(`${d.tripCount} serviço${d.tripCount === 1 ? "" : "s"} · ${d.totalKm.toLocaleString("pt-BR")} km`, bx + 12, y + 38, 7.5, { color: [187, 187, 187] });
  if (prepaid) {
    T(`Pago na reserva: ${brl(prepaid)}`, bx + 12, y + 53, 7.5, { color: [221, 221, 221] });
    T(`Saldo: ${brl(Math.max(0, d.total - prepaid))}`, bx + 12, y + 66, 8.5, { bold: true, color: WHITE });
  }
  y += Math.max(clientLines.length * 11.5 + 22, bh + 4, 74);

  if (d.nfNumber || d.boletoLine) {
    const lines = [d.nfNumber ? `Nota fiscal nº ${d.nfNumber}` : null, d.boletoLine ? `Linha digitável do boleto: ${d.boletoLine}` : null].filter(Boolean) as string[];
    pdf.roundRect(L, y, W, lines.length * 12 + 12, 6, [248, 245, 238], [234, 228, 214]);
    lines.forEach((l, i) => T(l, L + 10, y + 15 + i * 12, 8.5, { bold: i === 0 && Boolean(d.nfNumber) }));
    y += lines.length * 12 + 24;
  }

  // Tabela
  const cols = { data: L, pax: L + 76, route: L + 196, svc: R - 165, km: R - 70, val: R };
  const routeW = cols.svc - cols.route - 10;
  const header = () => {
    T("RELATÓRIO DOS SERVIÇOS", L, y, 8.5, { bold: true });
    y += 14;
    T("DATA", cols.data + 2, y, 7, { color: LBL });
    T("PASSAGEIRO", cols.pax, y, 7, { color: LBL });
    T("TRAJETO (EMBARQUE » PARADAS » DESTINO)", cols.route, y, 7, { color: LBL });
    T("SERVIÇO", cols.svc, y, 7, { color: LBL });
    T("KM", cols.km, y, 7, { color: LBL, align: "right" });
    T("VALOR", cols.val - 2, y, 7, { color: LBL, align: "right" });
    y += 6;
    pdf.line(L, y, R, y, GOLD, 1.5);
    y += 4;
  };
  header();
  const bottom = pdf.H - 60;
  for (const r of d.rows) {
    const route: { t: string; bold?: boolean; muted?: boolean }[] = [];
    r.route.forEach((p, i) => {
      const mark = i === 0 ? "•" : "»";
      const strong = i === 0 || i === r.route.length - 1;
      wrap(`${mark} ${p.address}`, 8, routeW).forEach((t, k) => route.push({ t: k ? `   ${t}` : t, bold: strong && k === 0 }));
      if (p.who) route.push({ t: `   ${p.who}`, muted: true });
    });
    if (r.extra) wrap(r.extra, 7.5, routeW).forEach((t) => route.push({ t, muted: true }));
    if (r.waitCharge) route.push({ t: `+ Hora extra / espera: ${r.waitCharge.billable_minutes} min · ${brl(r.waitCharge.amount)}`, bold: true });
    const pax = wrap(r.passenger || "-", 8, cols.route - cols.pax - 8);
    if (r.requester) pax.push(`pedido: ${r.requester}`);
    const svc = wrap(r.service, 8, cols.km - cols.svc - 30);
    const h = Math.max(route.length, pax.length, svc.length, r.waitCharge ? 3 : 2) * 10.5 + 10;
    if (y + h > bottom) {
      pdf.addPage();
      y = 40;
      header();
    }
    const ty = y + 11;
    T(r.when, cols.data + 2, ty, 8);
    T(r.ref, cols.data + 2, ty + 10.5, 7, { color: MUTED });
    pax.forEach((t, i) => T(t, cols.pax, ty + i * 10.5, i === pax.length - 1 && r.requester ? 7 : 8, { color: i === pax.length - 1 && r.requester ? MUTED : INK }));
    route.forEach((l, i) => T(l.t, cols.route, ty + i * 10.5, l.muted ? 7 : 8, { bold: l.bold, color: l.muted ? MUTED : INK }));
    svc.forEach((t, i) => T(t, cols.svc, ty + i * 10.5, 8));
    T(r.km ? r.km.toLocaleString("pt-BR") : "—", cols.km, ty, 8, { align: "right" });
    T(r.amount == null ? "—" : brl(r.amount), cols.val - 2, ty, 8.5, { bold: true, align: "right" });
    if (r.waitCharge && r.amount != null) {
      T(`corrida ${brl(Math.round((r.amount - r.waitCharge.amount) * 100) / 100)}`, cols.val - 2, ty + 10.5, 7, { color: MUTED, align: "right" });
      T(`+ hora extra ${brl(r.waitCharge.amount)}`, cols.val - 2, ty + 20, 7, { color: MUTED, align: "right" });
    }
    y += h;
    pdf.line(L, y, R, y, LINE, 0.8);
  }
  if (y + 30 > bottom) {
    pdf.addPage();
    y = 40;
  }
  y += 16;
  T("Total", L, y, 9.5, { bold: true });
  T(d.totalKm.toLocaleString("pt-BR"), cols.km, y, 9, { bold: true, align: "right" });
  T(brl(d.total), cols.val - 2, y, 10, { bold: true, align: "right" });
  if (prepaid) {
    y += 14;
    T(`Pago na reserva: ${brl(prepaid)} · Saldo a pagar: ${brl(Math.max(0, d.total - prepaid))}`, R - 2, y, 8.5, { align: "right" });
  }

  pdf.onEachPage((p, total) => {
    pdf.line(L, pdf.H - 32, R, pdf.H - 32, GOLD, 0.8);
    T(`${d.issuer.name} · CNPJ ${fmtDocNumber(d.issuer.cnpj)} · ${d.issuer.contact}`, L, pdf.H - 20, 7, { color: MUTED });
    T(`Fatura ${d.number} · página ${p} de ${total}`, R, pdf.H - 20, 7, { color: MUTED, align: "right" });
  });
  return pdf.toBytes();
}
