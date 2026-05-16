import type { UserRole } from "@/lib/domain/types";

export const AUDIT_LIST_ROLES: readonly UserRole[] = ["admin", "operador", "financeiro"];

export function canListAuditEvents(role: UserRole): boolean {
  return (AUDIT_LIST_ROLES as readonly string[]).includes(role);
}
