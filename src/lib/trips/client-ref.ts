/** Nº de referência do cliente (ex.: NR da CEP) gravado nas observações como "O.S./Ref.: NR263982-C1". */
export function clientRefFromNotes(notes: string | null | undefined): string | null {
  const m = String(notes ?? "").match(/O\.S\.\/Ref\.:\s*([^\s,;]+)/i);
  return m ? m[1].trim().toUpperCase() : null;
}
