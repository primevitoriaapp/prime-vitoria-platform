/** Filtro opcional de eventos de auditoria na timeline (prefixo de `action`, ex.: `finance.`). */
export function auditActionMatchesPrefix(action: string, prefix: string | null): boolean {
  if (prefix == null || prefix === "") return true;
  return action.startsWith(prefix);
}
