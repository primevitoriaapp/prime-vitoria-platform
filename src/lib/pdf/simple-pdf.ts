/**
 * Gerador de PDF simples, sem dependências (fontes Helvetica padrão, WinAnsi).
 * Serve para orçamentos e documentos curtos: texto, quebra de linha, retângulos, linhas e imagem JPEG.
 */

// Larguras (1/1000 em) da Helvetica e Helvetica-Bold para os caracteres 32..126.
const W_REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584,
  584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667,
  611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500,
  722, 500, 500, 500, 334, 260, 334, 584
];
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584,
  584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667,
  611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556,
  778, 556, 556, 500, 389, 280, 389, 584
];
const SPECIAL: Record<string, { code: number; w: number }> = {
  "€": { code: 0x80, w: 556 },
  "•": { code: 0x95, w: 350 },
  "–": { code: 0x96, w: 556 },
  "—": { code: 0x97, w: 1000 },
  "“": { code: 0x93, w: 333 },
  "”": { code: 0x94, w: 333 },
  "‘": { code: 0x91, w: 222 },
  "’": { code: 0x92, w: 222 },
  "…": { code: 0x85, w: 1000 }
};

export type Font = "R" | "B";
export type RGB = [number, number, number];

/** Troca caracteres fora do WinAnsi por equivalentes simples. */
function normalize(s: string): string {
  return s
    .replace(/→/g, "»")
    .replace(/\u2212/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[→➜]/g, "»")
    .replace(/\t/g, " ")
    .replace(/[​-‍﻿]/g, "");
}

function charWidth(ch: string, font: Font): number {
  const c = ch.charCodeAt(0);
  const table = font === "B" ? W_BOLD : W_REG;
  if (c >= 32 && c <= 126) return table[c - 32];
  if (SPECIAL[ch]) return SPECIAL[ch].w;
  if (c === 0xb7) return 278; // ·
  if (c === 0xba || c === 0xaa) return 365; // º ª
  if (c === 0xbb || c === 0xab) return 556; // » «
  if (c === 0xb0) return 400; // °
  const base = ch.normalize("NFD")[0];
  const b = base.charCodeAt(0);
  if (b >= 32 && b <= 126) return table[b - 32];
  return 556;
}

export function textWidth(s: string, font: Font, size: number): number {
  let w = 0;
  for (const ch of normalize(s)) w += charWidth(ch, font);
  return (w * size) / 1000;
}

function encode(s: string): string {
  let out = "";
  for (const ch of normalize(s)) {
    const c = ch.charCodeAt(0);
    let code: number;
    if (c < 128) code = c;
    else if (SPECIAL[ch]) code = SPECIAL[ch].code;
    else if (c >= 0xa0 && c <= 0xff) code = c;
    else code = 63; // ?
    if (code === 40 || code === 41 || code === 92) out += "\\" + String.fromCharCode(code);
    else if (code < 32 || code > 126) out += "\\" + code.toString(8).padStart(3, "0");
    else out += String.fromCharCode(code);
  }
  return out;
}

/** Quebra o texto em linhas que cabem na largura. */
export function wrap(text: string, font: Font, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of String(text ?? "").split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const tryLine = line ? `${line} ${w}` : w;
      if (textWidth(tryLine, font, size) <= maxWidth) {
        line = tryLine;
        continue;
      }
      if (line) lines.push(line);
      // palavra maior que a largura: quebra por caractere
      let rest = w;
      while (textWidth(rest, font, size) > maxWidth) {
        let k = rest.length;
        while (k > 1 && textWidth(rest.slice(0, k), font, size) > maxWidth) k--;
        lines.push(rest.slice(0, k));
        rest = rest.slice(k);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const col = (c: RGB) => c.map((v) => n(v / 255)).join(" ");

type Img = { data: Uint8Array; w: number; h: number; gray: boolean };

/** Lê largura e altura de um JPEG (procura o marcador SOF). */
export function jpegInfo(data: Uint8Array): { w: number; h: number; gray: boolean } | null {
  if (data[0] !== 0xff || data[1] !== 0xd8) return null;
  let i = 2;
  while (i < data.length) {
    if (data[i] !== 0xff) return null;
    const m = data[i + 1];
    const len = (data[i + 2] << 8) | data[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const h = (data[i + 5] << 8) | data[i + 6];
      const w = (data[i + 7] << 8) | data[i + 8];
      return { w, h, gray: data[i + 9] === 1 };
    }
    i += 2 + len;
  }
  return null;
}

/** Documento A4 em pontos (0,0 no canto superior esquerdo para facilitar o layout). */
export class SimplePdf {
  readonly W = 595.28;
  readonly H = 841.89;
  private pages: string[] = [];
  private cur = "";
  private images: Img[] = [];

  constructor() {
    this.addPage();
  }

  get pageCount() {
    return this.pages.length + 1;
  }

  addPage() {
    if (this.cur || this.pages.length) this.pages.push(this.cur);
    this.cur = "";
  }

  /** Volta a escrever numa página já fechada (ex.: rodapé com "página x de y"). */
  onEachPage(fn: (page: number, total: number) => void) {
    const all = [...this.pages, this.cur];
    const total = all.length;
    const out: string[] = [];
    all.forEach((content, i) => {
      this.cur = content;
      fn(i + 1, total);
      out.push(this.cur);
    });
    this.cur = out.pop() as string;
    this.pages = out;
  }

  rect(x: number, y: number, w: number, h: number, fill: RGB, stroke?: RGB, lw = 0.6) {
    const yy = this.H - y - h;
    this.cur += `${col(fill)} rg ${stroke ? `${col(stroke)} RG ${n(lw)} w ` : ""}${n(x)} ${n(yy)} ${n(w)} ${n(h)} re ${stroke ? "B" : "f"}\n`;
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, fill: RGB, stroke?: RGB, lw = 0.6) {
    const k = 0.5523 * r;
    const X = x,
      Y = this.H - y - h;
    const p = [
      `${n(X + r)} ${n(Y)} m`,
      `${n(X + w - r)} ${n(Y)} l`,
      `${n(X + w - r + k)} ${n(Y)} ${n(X + w)} ${n(Y + r - k)} ${n(X + w)} ${n(Y + r)} c`,
      `${n(X + w)} ${n(Y + h - r)} l`,
      `${n(X + w)} ${n(Y + h - r + k)} ${n(X + w - r + k)} ${n(Y + h)} ${n(X + w - r)} ${n(Y + h)} c`,
      `${n(X + r)} ${n(Y + h)} l`,
      `${n(X + r - k)} ${n(Y + h)} ${n(X)} ${n(Y + h - r + k)} ${n(X)} ${n(Y + h - r)} c`,
      `${n(X)} ${n(Y + r)} l`,
      `${n(X)} ${n(Y + r - k)} ${n(X + r - k)} ${n(Y)} ${n(X + r)} ${n(Y)} c`
    ].join(" ");
    this.cur += `${col(fill)} rg ${stroke ? `${col(stroke)} RG ${n(lw)} w ` : ""}${p} h ${stroke ? "B" : "f"}\n`;
  }

  line(x1: number, y1: number, x2: number, y2: number, color: RGB, lw = 0.6) {
    this.cur += `${col(color)} RG ${n(lw)} w ${n(x1)} ${n(this.H - y1)} m ${n(x2)} ${n(this.H - y2)} l S\n`;
  }

  /** Texto com a linha de base em y (de cima para baixo). */
  text(s: string, x: number, y: number, opts: { font?: Font; size?: number; color?: RGB; align?: "left" | "right" | "center"; spacing?: number } = {}) {
    const font = opts.font ?? "R";
    const size = opts.size ?? 10;
    const w = textWidth(s, font, size) + (opts.spacing ? opts.spacing * Math.max(0, normalize(s).length - 1) : 0);
    const xx = opts.align === "right" ? x - w : opts.align === "center" ? x - w / 2 : x;
    const tc = opts.spacing ? `${n(opts.spacing)} Tc ` : "";
    this.cur += `BT /F${font === "B" ? 2 : 1} ${n(size)} Tf ${tc}${col(opts.color ?? [17, 17, 17])} rg ${n(xx)} ${n(this.H - y)} Td (${encode(s)}) Tj ${opts.spacing ? "0 Tc " : ""}ET\n`;
  }

  image(data: Uint8Array, x: number, y: number, w: number, h: number) {
    const info = jpegInfo(data);
    if (!info) return;
    this.images.push({ data, w: info.w, h: info.h, gray: info.gray });
    const name = `Im${this.images.length}`;
    this.cur += `q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(this.H - y - h)} cm /${name} Do Q\n`;
  }

  toBytes(): Uint8Array {
    const pages = [...this.pages, this.cur];
    const enc = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let pos = 0;
    const push = (b: Uint8Array | string) => {
      const u = typeof b === "string" ? latin1(b) : b;
      chunks.push(u);
      pos += u.length;
    };
    const objs: (string | { head: string; stream: Uint8Array })[] = [];
    // 1 catálogo, 2 páginas, 3-4 fontes, depois imagens, depois páginas e conteúdos
    const imgStart = 5;
    const pageStart = imgStart + this.images.length;
    const kids = pages.map((_, i) => `${pageStart + i * 2} 0 R`).join(" ");
    objs.push("<< /Type /Catalog /Pages 2 0 R >>");
    objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    this.images.forEach((im) => {
      objs.push({
        head: `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /${im.gray ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>`,
        stream: im.data
      });
    });
    const xobj = this.images.length ? `/XObject << ${this.images.map((_, i) => `/Im${i + 1} ${imgStart + i} 0 R`).join(" ")} >>` : "";
    pages.forEach((content, i) => {
      objs.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(this.W)} ${n(this.H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xobj} >> /Contents ${pageStart + i * 2 + 1} 0 R >>`
      );
      const body = latin1(content);
      objs.push({ head: `<< /Length ${body.length} >>`, stream: body });
    });
    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    objs.forEach((o, i) => {
      offsets.push(pos);
      if (typeof o === "string") push(`${i + 1} 0 obj\n${o}\nendobj\n`);
      else {
        push(`${i + 1} 0 obj\n${o.head}\nstream\n`);
        push(o.stream);
        push("\nendstream\nendobj\n");
      }
    });
    const xref = pos;
    push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`);
    offsets.forEach((o) => push(`${String(o).padStart(10, "0")} 00000 n \n`));
    push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    void enc;
    const out = new Uint8Array(pos);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

function latin1(s: string): Uint8Array {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
  return u;
}
