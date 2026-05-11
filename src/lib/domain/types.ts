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
  clientId?: string;
  driverId?: string;
}

export interface Trip {
  id: string;
  client_id: string;
  driver_id?: string;
  vehicle_id?: string;
  scheduled_at: string;
  dispatch_mode: DispatchMode;
  operational_status: TripOperationalStatus;
  financial_status: TripFinancialStatus;
}
