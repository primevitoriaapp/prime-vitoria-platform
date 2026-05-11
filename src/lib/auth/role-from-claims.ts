import type { UserRole } from "../domain/types";

const VALID_APP_ROLES: UserRole[] = ["admin", "operador", "financeiro", "cliente", "motorista"];

/** Valida string contra papeis operacionais (nao inclui `guest`). */
export function asUserRole(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;
  return VALID_APP_ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

/**
 * Papel a partir de claims JWT quando nao ha consulta a `profiles`
 * (ex.: middleware Edge).
 */
export function roleFromJwtClaims(user: {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}): UserRole {
  return asUserRole(user.app_metadata?.role) ?? asUserRole(user.user_metadata?.role) ?? "cliente";
}
