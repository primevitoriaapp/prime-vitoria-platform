/** Acha o número do voo em texto livre (voucher, observação, e-mail). Sem dependências: testável. */

const AIRLINES: Record<string, string> = {
  latam: "LA",
  tam: "JJ",
  gol: "G3",
  azul: "AD",
  tap: "TP",
  american: "AA",
  copa: "CM",
  avianca: "AV",
  "air france": "AF",
  klm: "KL",
  iberia: "IB",
  lufthansa: "LH",
  united: "UA",
  delta: "DL",
  emirates: "EK",
  voepass: "2Z",
  passaredo: "2Z"
};

// Códigos IATA que aparecem sozinhos no texto sem confundir com outras palavras.
const KNOWN_CODES = new Set(["LA", "JJ", "G3", "AD", "TP", "AA", "CM", "AV", "AF", "KL", "IB", "LH", "UA", "DL", "EK", "2Z", "AR", "H2", "UX"]);

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function extractFlightNumber(text: string | null | undefined): string | null {
  const raw = (text ?? "").replace(/\s+/g, " ");
  if (!raw.trim()) return null;
  const t = norm(raw);

  // 1) "voo LA 3844", "vôo: G3-1844", "flight AD4512", "nº do voo LA3844"
  const m1 = t.match(/\b(?:voo|vo|flight|flt)\b\s*(?:n[o.º°]?\s*)?(?:do\s+voo\s*)?[:#-]?\s*([a-z0-9]{2})\s*-?\s*(\d{2,4})\b/i);
  if (m1 && /[a-z]/.test(m1[1])) return `${m1[1].toUpperCase()}${m1[2]}`;

  // 2) Nome da companhia + número: "LATAM 3844", "Gol 1844", "voo 4512 da Azul"
  for (const [name, code] of Object.entries(AIRLINES)) {
    const re1 = new RegExp(`\\b${name}\\b\\s*(?:voo\\s*)?[:#-]?\\s*(?:${code.toLowerCase()}\\s*)?(\\d{2,4})\\b`);
    const re2 = new RegExp(`\\bvoo\\s*(?:n[o.º°]?\\s*)?[:#-]?\\s*(\\d{2,4})\\b[^.]{0,20}\\b${name}\\b`);
    const m = t.match(re1) ?? t.match(re2);
    if (m) return `${code}${m[1]}`;
  }

  // 3) Código IATA conhecido colado ou separado do número: "LA3844", "G3 1844" (só com contexto de voo/aeroporto)
  if (/\b(voo|aeroporto|flight|desembarque|embarque|chegada|pouso)\b/.test(t)) {
    for (const m of raw.matchAll(/\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?-?(\d{3,4})\b/g)) {
      if (KNOWN_CODES.has(m[1])) return `${m[1]}${m[2]}`;
    }
  }
  return null;
}
