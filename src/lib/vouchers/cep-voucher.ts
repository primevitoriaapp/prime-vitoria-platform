/** Leitura do voucher "SOLICITAÇÃO DE SERVIÇO FORNECEDOR" da CEP Transportes. Funções puras. */
import type { ParsedVoucher, PdfWord, VoucherItem } from "./voucher-types.ts";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ordena as palavras em leitura natural e junta em texto. */
function join(ws: PdfWord[]): string {
  return [...ws]
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

/** Linhas: palavras com y próximo (tolerância pequena porque colunas vizinhas ficam desalinhadas). */
function lines(ws: PdfWord[], tol = 1.6): PdfWord[][] {
  const sorted = [...ws].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const out: PdfWord[][] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && last[0].page === w.page && Math.abs(last[0].y - w.y) <= tol) last.push(w);
    else out.push([w]);
  }
  return out.map((l) => l.sort((a, b) => a.x - b.x));
}

const lineText = (l: PdfWord[]) => l.map((w) => w.text).join(" ");

/** Ordem global de leitura (página, y). */
const pos = (w: { page: number; y: number }) => w.page * 10000 + w.y;

export function isCepVoucher(words: PdfWord[]): boolean {
  const t = norm(words.slice(0, 120).map((w) => w.text).join(" "));
  return t.includes("solicitacao de servico fornecedor") && (t.includes("07.302.239") || t.includes("cep"));
}

function splitAddress(text: string): { address: string; note: string } {
  const t = text.trim();
  if (!t || t === "-") return { address: "", note: "" };
  const m = t.match(/^(.*?\bBrasil)(?![a-zà-ú])[,.]?\s*(.*)$/i);
  if (m) return { address: m[1].trim(), note: m[2].trim() };
  return { address: t, note: "" };
}

function parseMoney(s: string): number | null {
  const m = s.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
  if (!m) return null;
  return Number(m[m.length - 1].replace(/\./g, "").replace(",", "."));
}

export function parseCepVoucher(words: PdfWord[]): ParsedVoucher | null {
  if (!isCepVoucher(words)) return null;
  const all = lines(words);
  const allText = all.map(lineText).join("\n");

  const number = allText.match(/FORNECEDOR\s+(NR\d+)/i)?.[1] ?? "";
  const event = allText.match(/\(Evento:\s*([^\n]*?)\)?\s*$/im)?.[1]?.replace(/\)\s*$/, "").trim() ?? "";
  const requestedBy = allText.match(/solicitado por:\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const issuerCnpj = allText.match(/CNPJ\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i)?.[1] ?? null;

  // Cabeçalhos dos itens: linha com "Item", "Data", "Cidade".
  const headers = all.filter((l) => {
    const t = norm(lineText(l));
    return /^item\b/.test(t) && t.includes("data") && t.includes("cidade");
  });
  const endMarker = all.find((l) => norm(lineText(l)).startsWith("informacoes importantes"));
  const endPos = endMarker ? pos(endMarker[0]) : Infinity;

  const items: VoucherItem[] = [];
  headers.forEach((h, idx) => {
    const start = pos(h[0]);
    const end = idx + 1 < headers.length ? pos(headers[idx + 1][0]) : endPos;
    const ws = words.filter((w) => pos(w) > start + 0.5 && pos(w) < end - 0.5);
    const isLetter = (w: PdfWord) => /^[A-Z]$/.test(w.text) && w.x < 60;
    // A letra do item fica na mesma altura de "Passageiros": fica fora das linhas usadas para achar os títulos.
    const ls = lines(ws.filter((w) => !isLetter(w)));
    const xOf = (label: string) => h.find((w) => norm(w.text) === label)?.x ?? 0;
    const cidadeX = xOf("cidade");
    const tipoX = xOf("tipo");

    const findLine = (re: RegExp) => ls.find((l) => re.test(norm(lineText(l))));
    const obsServ = findLine(/^observacoes do servico/);
    const origemHdr = findLine(/^origem\b.*destino/);
    const paxHdr = findLine(/^passageiros\b/);
    const obsForn = findLine(/^observacoes fornecedor/);
    const vehHdr = findLine(/^veiculo \/ tipo/);
    const payLine = ls.find((l) => /faturado|valor/i.test(lineText(l)) && parseMoney(lineText(l)) != null);
    const pOf = (l?: PdfWord[]) => (l ? pos(l[0]) : Infinity);
    const between = (a: number, b: number) => ws.filter((w) => pos(w) > a + 0.5 && pos(w) < b - 0.5);

    // Data, cidade, serviço (antes de "Observações do serviço").
    const top = between(start, pOf(obsServ));
    const dt = join(top).match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2})/);
    if (!dt) return;
    const city = join(top.filter((w) => w.x >= cidadeX - 2 && w.x < tipoX - 2));
    const service = join(top.filter((w) => w.x >= tipoX - 2));

    const serviceNotes = join(between(pOf(obsServ), pOf(origemHdr)));

    // Origem e destino em duas colunas, até "Passageiros".
    const destX = origemHdr?.find((w) => norm(w.text) === "destino")?.x ?? tipoX;
    const routeWords = between(pOf(origemHdr), pOf(paxHdr)).filter((w) => !isLetter(w));
    const o = splitAddress(join(routeWords.filter((w) => w.x < destX - 2)));
    const d = splitAddress(join(routeWords.filter((w) => w.x >= destX - 2)));

    // Letra do item (sozinha, bem à esquerda).
    const letter = ws.find(isLetter)?.text ?? String(idx + 1);

    // Passageiros (coluna da esquerda) e solicitantes (direita).
    const solX = paxHdr?.find((w) => norm(w.text).startsWith("solicitantes"))?.x ?? destX;
    const paxWords = between(pOf(paxHdr), pOf(obsForn)).filter((w) => !isLetter(w));
    const paxText = join(paxWords.filter((w) => w.x < solX - 2)).replace(/\[\s*/g, "[").replace(/\s*\]/g, "]");
    const passengers = [...paxText.matchAll(/([^[\],;]+?)\s*\[([^\]]*)\]?/g)]
      .map((m) => ({ name: m[1].replace(/\s+/g, " ").trim(), phone: m[2].replace(/[^\d+]/g, "") || null }))
      .filter((p) => p.name.length > 1);
    if (!passengers.length && paxText) passengers.push({ name: paxText, phone: null });
    const requesters = join(paxWords.filter((w) => w.x >= solX - 2))
      .split(/\]\s*/)
      .map((s) => s.replace(/\[.*$/, "").trim())
      .filter(Boolean);

    const vehicleType = join(between(pOf(vehHdr), pOf(payLine) - 15).filter((w) => w.x < destX - 2)).replace(/forma de pagamento.*$/i, "").trim();
    const amount = payLine ? parseMoney(lineText(payLine)) : null;

    const disponivel = /dispon[ií]vel/i.test(service);
    const hours = Number(service.match(/(\d{1,2})\s*HORAS?/i)?.[1] ?? "") || null;
    const km = Number(service.match(/(\d{1,4})\s*KM/i)?.[1] ?? "") || null;
    const notesAll = `${o.note} ${d.note} ${serviceNotes}`;
    const fl = notesAll.match(/\bvoo\s+([A-Z0-9]{2})\s*(\d{2,4})/i);
    // "seguir para>> Origem - Cozinha ... Brasil" → local do evento.
    const stop = o.note.match(/seguir para\s*>*\s*(?:origem\s*-\s*)?(.+?\bBrasil)(?![a-zà-ú])/i)?.[1]?.trim() ?? null;

    items.push({
      letter,
      date: `${dt[3]}-${dt[2]}-${dt[1]}`,
      time: `${dt[4]}:${dt[5]}`,
      city,
      service,
      kind: disponivel ? "disponivel" : "transfer",
      hours,
      km,
      serviceNotes,
      origin: o.address,
      originNote: o.note,
      destination: d.address,
      destinationNote: d.note,
      passengers,
      requesters,
      vehicleType,
      amount,
      flight: fl ? `${fl[1].toUpperCase()}${fl[2]}` : null,
      stopPlace: stop
    });
  });

  return { format: "cep", number, event, requestedBy, issuerCnpj, issuerName: "CEP Transportes", items };
}
