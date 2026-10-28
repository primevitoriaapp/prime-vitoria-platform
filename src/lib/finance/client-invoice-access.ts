import type { SessionContext } from "@/lib/domain/types";

export function isFinanceStaff(session: SessionContext): boolean {
  return session.role === "admin" || session.role === "financeiro" || session.role === "operador";
}

/** Quem pode ver a fatura: equipe Prime ou o gestor da própria empresa. */
export function canViewClientInvoice(session: SessionContext, invoice: { client_id: string; status: string }): boolean {
  if (isFinanceStaff(session)) return true;
  return (
    session.role === "cliente" &&
    session.clientAccess !== "solicitante" &&
    Boolean(session.clientId) &&
    session.clientId === invoice.client_id &&
    invoice.status !== "cancelada"
  );
}
