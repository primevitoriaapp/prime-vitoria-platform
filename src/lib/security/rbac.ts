import type { SessionContext, UserRole } from "../domain/types";

const ROLE_CAPABILITIES: Record<UserRole, string[]> = {
  guest: [],
  admin: ["*"],
  operador: [
    "trip.read",
    "trip.write",
    "dispatch",
    "driver.read",
    "vehicle.read",
    "vehicle.write",
    "client.read",
    "client.write",
    "location.write",
    "erp.mapping.read",
    "erp.mapping.write",
    "erp.jobs.enqueue",
    "erp.jobs.process",
    "jobs.notifications.process",
    "jobs.reconcile.run",
    "profiles.read"
  ],
  financeiro: [
    "finance.read",
    "finance.write",
    "trip.read",
    "report.read",
    "erp.mapping.read",
    "erp.jobs.enqueue",
    "jobs.reconcile.run"
  ],
  cliente: ["trip.request", "trip.read.own"],
  motorista: ["trip.read.assigned", "trip.accept", "trip.status", "location.write"]
};

export function can(session: SessionContext, capability: string): boolean {
  const allowed = ROLE_CAPABILITIES[session.role] ?? [];
  return allowed.includes("*") || allowed.includes(capability);
}

export function assertCapability(session: SessionContext, capability: string): void {
  if (!can(session, capability)) {
    throw new Error(`Forbidden: missing capability ${capability}`);
  }
}
