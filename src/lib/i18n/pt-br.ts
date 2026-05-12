import type { DispatchMode, TripOperationalStatus, UserRole } from "@/lib/domain/types";

/** Rótulos em português (Brasil) para status operacional de corrida (valores da API permanecem em inglês). */
export const STATUS_CORRIDA_PT: Record<TripOperationalStatus, string> = {
  requested: "Solicitada",
  approved: "Aprovada",
  dispatched: "Despachada",
  accepted: "Aceita",
  on_the_way: "A caminho",
  arrived: "Chegou ao local",
  in_progress: "Em andamento",
  completed: "Finalizada",
  cancelled: "Cancelada",
  rejected: "Recusada",
  no_show: "Não compareceu",
  reassigned: "Reatribuída"
};

export const MODO_DESPACHO_PT: Record<DispatchMode, string> = {
  directed: "Direcionado",
  offer: "Por oferta"
};

const PAPEL_USUARIO_PT: Record<Exclude<UserRole, "guest">, string> = {
  admin: "Administrador",
  operador: "Operador",
  financeiro: "Financeiro",
  cliente: "Cliente",
  motorista: "Motorista"
};

export function papelUsuarioPt(role: string): string {
  if (role === "guest") return "Convidado";
  return PAPEL_USUARIO_PT[role as Exclude<UserRole, "guest">] ?? role;
}
