/** Valor por extenso em reais (ex.: 1.250,50 → "mil duzentos e cinquenta reais e cinquenta centavos"). */
const U = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const D = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const C = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function upTo999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (c) parts.push(C[c]);
  if (r) parts.push(r < 20 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ` e ${U[r % 10]}` : ""));
  return parts.join(" e ");
}

function intWords(n: number): string {
  if (n === 0) return "zero";
  const mi = Math.floor(n / 1_000_000);
  const mil = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (mi) parts.push(mi === 1 ? "um milhão" : `${upTo999(mi)} milhões`);
  if (mil) parts.push(mil === 1 ? "mil" : `${upTo999(mil)} mil`);
  if (rest) parts.push(upTo999(rest));
  if (parts.length > 1 && rest && (rest < 100 || rest % 100 === 0)) {
    const last = parts.pop()!;
    return `${parts.join(" ")} e ${last}`;
  }
  return parts.join(" ");
}

export function reaisPorExtenso(value: number): string {
  const v = Math.round(Math.abs(value) * 100);
  const reais = Math.floor(v / 100);
  const cents = v % 100;
  const r = reais ? `${intWords(reais)} ${reais === 1 ? "real" : reais % 1_000_000 === 0 ? "de reais" : "reais"}` : "";
  const c = cents ? `${intWords(cents)} ${cents === 1 ? "centavo" : "centavos"}` : "";
  return [r, c].filter(Boolean).join(" e ") || "zero reais";
}
