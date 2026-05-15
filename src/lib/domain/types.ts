export type UserRole = "admin" | "operador" | "financeiro" | "cliente" | "motorista" | "guest";

export type DispatchMode = "directed" | "offer";

export type TripOperationalStatus =
  | "requested"
  | "approved"
  | "dispatched"
  | "accepted"
  | "on_the_way"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rejected"
  | "no_show"
  | "reassigned";

export type TripFinancialStatus = "pending" | "partially_paid" | "paid" | "cancelled";

export interface SessionContext {
  userId: string;
  role: UserRole;
  /** Organizacao (SaaS). Ausente em `guest`; fallback em API via tenant padrao. */
  tenantId?: string;
  clientId?: string;
  driverId?: string;
}

export interface Trip {
  id: string;
  tenant_id: string;
  client_id: string;
  driver_id?: string;
  vehicle_id?: string;
  scheduled_at: string;
  dispatch_mode: DispatchMode;
  operational_status: TripOperationalStatus;
  financial_status: TripFinancialStatus;
  /** Campos adicionais retornados pela API em listagens/detalhe */
  service_type?: string;
  origin_text?: string;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination_text?: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  passenger_name?: string | null;
  cost_center_id?: string | null;
}
