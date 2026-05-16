/** Filtro opcional de eventos de auditoria na timeline (prefixo de `action`, ex.: `finance.`). */
export function auditActionMatchesPrefix(action: string, prefix: string | null): boolean {
  if (prefix == null || prefix === "") return true;
  return action.startsWith(prefix);
}

export function uniqueAuditRowsById<T extends { id: unknown }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(row);
  }
  return unique;
}
