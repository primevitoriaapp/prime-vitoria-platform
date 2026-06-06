import type { User } from "@supabase/supabase-js";
import type { UserRole } from "../domain/types";

const VALID_APP_ROLES: UserRole[] = ["admin", "operador", "financeiro", "cliente", "motorista"];

/** Valida string contra papeis operacionais (nao inclui `guest`). */
export function asUserRole(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;
  return VALID_APP_ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

/** Papel de perfil, incluindo aliases do portal corporativo. */
export function roleFromProfileField(role: unknown): UserRole | null {
  if (typeof role !== "string") return null;
  const normalized = role.trim().toLowerCase();
  if (normalized === "cliente" || normalized === "client_admin") return "cliente";
  return asUserRole(role);
}

export type ResolveEffectiveRoleInput = {
  user: User;
  profileRole?: unknown;
  profileClientId?: string | null;
  driverId?: string | null;
};

/**
 * Papel efectivo do utilizador (perfil, vínculo motorista, portal cliente, JWT).
 * Partilhado entre login, sessão API e middleware.
 */
export function resolveEffectiveUserRole(input: ResolveEffectiveRoleInput): UserRole {
  const fromProfile = roleFromProfileField(input.profileRole);
  if (fromProfile) return fromProfile;

  if (input.driverId) return "motorista";

  if (input.profileClientId) return "cliente";

  const claimRole =
    asUserRole(input.user.user_metadata?.role) ?? asUserRole(input.user.app_metadata?.role);
  if (claimRole) return claimRole;

  return roleFromJwtClaims(input.user);
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
