/**
 * Serviço que a central dividiu em trechos (ex.: CEP pede um "disponível" e vira NR-E1 ida + NR-E2 volta)
 * volta a ser UM item para o cliente na fatura: NR-E, com o trajeto todo e o valor somado.
 * Funções puras.
 */

/** "NR263701-E1" → "NR263701-E"; sem número no final → null (não foi dividido). */
export function splitBaseRef(ref: string | null | undefined): string | null {
  const m = /^(.+-[A-Za-z]+)(\d+)$/.exec(String(ref ?? "").trim());
  return m ? m[1] : null;
}

/** Agrupa itens com o mesmo NR base (2 ou mais trechos) mantendo a ordem do primeiro. */
export function groupSplitItems<T>(items: T[], refOf: (t: T) => string | null | undefined): (T | { base: string; parts: T[] })[] {
  const count = new Map<string, number>();
  for (const it of items) {
    const b = splitBaseRef(refOf(it));
    if (b) count.set(b, (count.get(b) ?? 0) + 1);
  }
  const out: (T | { base: string; parts: T[] })[] = [];
  const groupAt = new Map<string, { base: string; parts: T[] }>();
  for (const it of items) {
    const b = splitBaseRef(refOf(it));
    if (!b || (count.get(b) ?? 0) < 2) {
      out.push(it);
      continue;
    }
    const g = groupAt.get(b);
    if (g) g.parts.push(it);
    else {
      const ng = { base: b, parts: [it] };
      groupAt.set(b, ng);
      out.push(ng);
    }
  }
  return out;
}

export function isSplitGroup<T>(x: T | { base: string; parts: T[] }): x is { base: string; parts: T[] } {
  return typeof x === "object" && x !== null && "parts" in (x as object) && "base" in (x as object);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export const sumMoney = (ns: (number | null | undefined)[]): number | null => (ns.some((n) => n == null) ? null : r2(ns.reduce<number>((s, n) => s + Number(n), 0)));
