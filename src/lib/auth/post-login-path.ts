import type { UserRole } from "../domain/types";

/** Destino apos login (painel principal do papel). */
export function postLoginPathForRole(role: UserRole): string {
  switch (role) {
    case "motorista":
      return "/driver";
    case "cliente":
      return "/client";
    case "financeiro":
      return "/finance";
    case "admin":
    case "operador":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}
