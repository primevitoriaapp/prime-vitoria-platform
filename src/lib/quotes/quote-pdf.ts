import { SimplePdf, jpegInfo, wrap, type RGB } from "../pdf/simple-pdf.ts";
import type { QuoteDoc } from "./quote-document.ts";

const INK: RGB = [17, 17, 17];
const MUTED: RGB = [110, 104, 92];
const GOLD: RGB = [201, 168, 76];
const GOLD_DARK: RGB = [140, 112, 44];
const LINE: RGB = [234, 228, 214];
const SOFT: RGB = [248, 245, 238];
const WHITE: RGB = [255, 255, 255];

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const brDate = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join("/");

/** Orçamento em PDF no padrão preto e dourado da Prime. */
export function buildQuotePdf(q: QuoteDoc, logo: Uint8Array | null, photos: Map<string, Uint8Array> = new Map()): Uint8Array {
  const pdf = new SimplePdf();
  const M = 36;
  const R = pdf.W - M;
  const CW = R - M;
  let y = 0;

  // ---------- Cabeçalho ----------
  const HEAD = 104;
  pdf.rect(0, 0, pdf.W, HEAD, INK);
  pdf.rect(0, HEAD, pdf.W, 3, GOLD);
  let tx = M;
  if (logo) {
    try {
      const info = jpegInfo(logo);
      const k = info ? Math.min(72 / info.w, 72 / info.h) : 1;
      const w = info ? info.w * k : 72;
      const h = info ? info.h * k : 72;
      pdf.roundRect(M, 14, w + 4, h + 4, 6, WHITE);
      pdf.image(logo, M + 2, 16, w, h);
      tx = M + w + 18;
    } catch {
      tx = M;
    }
  }
  // Mesmo cabeçalho da fatura, do voucher e da O.S.
  if (tx === M) pdf.text("PRIME VITÓRIA", tx, 34, { font: "B", size: 18, color: WHITE, spacing: 0.6 });
  const hy = tx === M ? 48 : 34;
  pdf.text("TRANSPORTE EXECUTIVO · MOBILIDADE CORPORATIVA", tx, hy, { font: "B", size: 7.5, color: GOLD, spacing: 1 });
  pdf.text(q.issuer.legalName, tx, hy + 16, { font: "B", size: 9.5, color: WHITE });
  pdf.text(`CNPJ ${q.issuer.cnpj}`, tx, hy + 29, { size: 8, color: [190, 190, 190] });
  pdf.text([q.issuer.email, q.issuer.phone].filter(Boolean).join(" · "), tx, hy + 41, { size: 8, color: [190, 190, 190] });
  pdf.text("ORÇAMENTO", R, 36, { font: "B", size: 8, color: [190, 190, 190], align: "right", spacing: 1.4 });
  pdf.text(q.number, R, 60, { font: "B", size: 22, color: GOLD, align: "right" });
  pdf.text(`Emitido em ${new Date(q.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, R, 76, { size: 8.5, color: [220, 220, 220], align: "right" });
  if (q.validUntil) pdf.text(`Válido até ${brDate(q.validUntil)}`, R, 89, { size: 8.5, color: [220, 220, 220], align: "right" });
  y = HEAD + 22;

  // ---------- Emissor e cliente ----------
  const boxW = (CW - 12) / 2;
  const boxLines = (label: string, title: string, lines: (string | null)[]) => {
    const out: { t: string; bold?: boolean; label?: boolean }[] = [{ t: label, label: true }];
    for (const l of wrap(title, "B", 10.5, boxW - 24)) out.push({ t: l, bold: true });
    for (const raw of lines.filter(Boolean) as string[]) for (const l of wrap(raw, "R", 8.5, boxW - 24)) out.push({ t: l });
    return out;
  };
  const left = boxLines("EMPRESA", q.issuer.tradeName, [q.issuer.legalName, `CNPJ ${q.issuer.cnpj}`, q.issuer.address, q.issuer.phone ? `Tel. ${q.issuer.phone}` : null, q.issuer.email]);
  const right = boxLines("CLIENTE", q.client.name, [
    q.client.legalName,
    q.client.doc ? `${q.client.docLabel} ${q.client.doc}` : null,
    q.client.address,
    q.client.contact ? `A/C ${q.client.contact}` : null,
    q.client.phone ? `Tel. ${q.client.phone}` : null,
    q.client.email
  ]);
  const lineH = (l: { bold?: boolean; label?: boolean }) => (l.label ? 14 : l.bold ? 13.5 : 11.5);
  const boxH = Math.max(left.reduce((s, l) => s + lineH(l), 0), right.reduce((s, l) => s + lineH(l), 0)) + 20;
  const drawBox = (x: number, lines: typeof left) => {
    pdf.roundRect(x, y, boxW, boxH, 8, SOFT, LINE);
    let yy = y + 20;
    for (const l of lines) {
      if (l.label) pdf.text(l.t, x + 12, yy, { font: "B", size: 7, color: GOLD_DARK, spacing: 1.2 });
      else pdf.text(l.t, x + 12, yy, { font: l.bold ? "B" : "R", size: l.bold ? 10.5 : 8.5, color: l.bold ? INK : MUTED });
      yy += lineH(l);
    }
  };
  drawBox(M, left);
  drawBox(M + boxW + 12, right);
  y += boxH + 22;

  // ---------- Tabela de serviços ----------
  const C = { time: M, svc: M + 50, route: M + 250, qty: R - 92, val: R };
  const svcW = C.route - C.svc - 12;
  const routeW = C.qty - C.route - 22;
  const footerSpace = 60;
  const header = () => {
    // Cabeçalho da tabela igual ao relatório da fatura: rótulos dourados e linha dourada.
    const ty = y + 12;
    const LBL: RGB = [122, 106, 58];
    pdf.text("HORA", C.time + 6, ty, { size: 7, color: LBL, spacing: 0.8 });
    pdf.text("VEÍCULO E SERVIÇO", C.svc, ty, { size: 7, color: LBL, spacing: 0.8 });
    pdf.text("TRAJETO (EMBARQUE » DESTINO)", C.route, ty, { size: 7, color: LBL, spacing: 0.8 });
    pdf.text("QTD.", C.qty, ty, { size: 7, color: LBL, spacing: 0.8, align: "center" });
    pdf.text("VALOR", C.val - 6, ty, { size: 7, color: LBL, spacing: 0.8, align: "right" });
    y += 18;
    pdf.line(M, y, R, y, GOLD, 1.5);
    y += 2;
  };
  const newPage = () => {
    pdf.addPage();
    y = 40;
    header();
  };
  header();
  for (const g of q.groups) {
    if (y + 60 > pdf.H - footerSpace) newPage();
    y += 16;
    pdf.roundRect(M, y - 11, 6, 6, 3, GOLD);
    pdf.text(g.title, M + 12, y - 5, { font: "B", size: 9.5 });
    y += 4;
    for (const r of g.rows) {
      const svc: { t: string; f: "R" | "B"; c: RGB; s: number }[] = [];
      for (const l of wrap(r.vehicle, "B", 9, svcW)) svc.push({ t: l, f: "B", c: INK, s: 9 });
      for (const l of wrap([r.service, r.passengers].filter(Boolean).join(" · "), "R", 8.5, svcW)) svc.push({ t: l, f: "R", c: MUTED, s: 8.5 });
      if (r.note) for (const l of wrap(`Passageiros: ${r.note}`, "R", 8.5, svcW)) svc.push({ t: l, f: "R", c: MUTED, s: 8.5 });
      if (r.detail) for (const l of wrap(`Obs.: ${r.detail}`, "R", 8.5, svcW)) svc.push({ t: l, f: "R", c: GOLD_DARK, s: 8.5 });
      const rt: { t: string; c: RGB }[] = [];
      for (const l of wrap(r.diaria || !r.to ? r.from : `• ${r.from}`, "R", 8.5, routeW)) rt.push({ t: l, c: INK });
      if (r.to) for (const l of wrap(r.diaria ? r.to : `» ${r.to}`, "R", 8.5, routeW)) rt.push({ t: l, c: r.diaria ? MUTED : INK });
      const rowH = Math.max(svc.length, rt.length, r.qty > 1 ? 2 : 1) * 11.5 + 12;
      if (y + rowH > pdf.H - footerSpace) newPage();
      const ty = y + 14;
      pdf.text(r.time, C.time + 6, ty, { font: "B", size: 9 });
      svc.forEach((l, k) => pdf.text(l.t, C.svc, ty + k * 11.5, { font: l.f, size: l.s, color: l.c }));
      rt.forEach((l, k) => pdf.text(l.t, C.route, ty + k * 11.5, { size: 8.5, color: l.c }));
      pdf.text(String(r.qty), C.qty, ty, { size: 9, align: "center" });
      pdf.text(brl(r.total), C.val - 6, ty, { font: "B", size: 9, align: "right" });
      if (r.qty > 1) pdf.text(`${brl(r.unit)} cada`, C.val - 6, ty + 11.5, { size: 7.5, color: MUTED, align: "right" });
      y += rowH;
      pdf.line(M, y, R, y, LINE);
    }
  }

  // ---------- Totais ----------
  const totRows = 2 + (q.totals.discount > 0 ? 1 : 0);
  if (y + 30 + totRows * 16 + 30 > pdf.H - footerSpace) {
    pdf.addPage();
    y = 40;
  }
  y += 14;
  const tw = 220;
  const tx0 = R - tw;
  pdf.text("Subtotal", tx0 + 10, y + 10, { size: 9, color: MUTED });
  pdf.text(brl(q.totals.subtotal), R - 10, y + 10, { size: 9, align: "right" });
  y += 16;
  if (q.totals.discount > 0) {
    pdf.text("Desconto", tx0 + 10, y + 10, { size: 9, color: MUTED });
    pdf.text(`− ${brl(q.totals.discount)}`, R - 10, y + 10, { size: 9, align: "right" });
    y += 16;
  }
  pdf.roundRect(tx0, y + 2, tw, 36, 8, INK);
  pdf.text("TOTAL", tx0 + 12, y + 24, { font: "B", size: 8, color: [200, 200, 200], spacing: 1.2 });
  pdf.text(brl(q.totals.total), R - 12, y + 26, { font: "B", size: 16, color: GOLD, align: "right" });
  y += 54;

  // ---------- Sobre os veículos ----------
  if (q.vehicles.length) {
    const cardH = 74;
    if (y + 24 + cardH > pdf.H - footerSpace) {
      pdf.addPage();
      y = 40;
    }
    pdf.text("SOBRE OS VEÍCULOS", M, y, { font: "B", size: 7, color: GOLD_DARK, spacing: 1.2 });
    y += 10;
    for (const v of q.vehicles) {
      if (y + cardH > pdf.H - footerSpace) {
        pdf.addPage();
        y = 40;
      }
      pdf.roundRect(M, y, CW, cardH - 8, 8, SOFT);
      const img = photos.get(v.id);
      const box = { x: M + 8, y: y + 6, w: 96, h: cardH - 20 };
      pdf.roundRect(box.x, box.y, box.w, box.h, 6, WHITE);
      const info = img ? jpegInfo(img) : null;
      if (img && info) {
        const s = Math.min((box.w - 6) / info.w, (box.h - 6) / info.h);
        const w = info.w * s;
        const h = info.h * s;
        pdf.image(img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
      }
      const tx2 = box.x + box.w + 12;
      const tw2 = R - 10 - tx2;
      pdf.text(v.name, tx2, y + 20, { font: "B", size: 10 });
      const desc = v.description ?? (v.passengers ? `Até ${v.passengers} passageiros.` : "");
      wrap(desc, "R", 8.5, tw2)
        .slice(0, 3)
        .forEach((l, k) => pdf.text(l, tx2, y + 34 + k * 11, { size: 8.5, color: MUTED }));
      y += cardH;
    }
    y += 6;
  }

  // ---------- Observações e condições ----------
  const block = (label: string, body: string | null) => {
    if (!body) return;
    const lines = wrap(body, "R", 8.5, CW);
    let first = true;
    for (const l of lines) {
      if (y + (first ? 30 : 12) > pdf.H - footerSpace) {
        pdf.addPage();
        y = 40;
        first = true;
      }
      if (first) {
        pdf.text(label, M, y, { font: "B", size: 7, color: GOLD_DARK, spacing: 1.2 });
        y += 14;
        first = false;
      }
      pdf.text(l, M, y, { size: 8.5, color: [60, 60, 60] });
      y += 12;
    }
    y += 10;
  };
  block("OBSERVAÇÕES", q.notes);
  block("CONDIÇÕES", q.conditions);

  // ---------- Rodapé em todas as páginas ----------
  const foot = [q.issuer.tradeName, q.issuer.phone, q.issuer.email].filter(Boolean).join("  ·  ");
  pdf.onEachPage((p, total) => {
    pdf.line(M, pdf.H - 34, R, pdf.H - 34, GOLD, 1);
    pdf.text(foot, M, pdf.H - 20, { size: 7.5, color: MUTED });
    pdf.text(`Orçamento ${q.number} · página ${p} de ${total}`, R, pdf.H - 20, { size: 7.5, color: MUTED, align: "right" });
  });
  return pdf.toBytes();
}
