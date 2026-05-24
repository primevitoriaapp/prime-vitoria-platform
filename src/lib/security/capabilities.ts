import type { UserRole } from "../domain/types.ts";

/**
 * Registo central de capabilities (preparação RBAC granular).
 * `rbac.ts` continua fonte de verdade para roles; este módulo documenta e agrupa.
 */
export const CAPABILITY_GROUPS = {
  trip: [
    "trip.read",
    "trip.read.own",
    "trip.read.assigned",
    "trip.write",
    "trip.request",
    "trip.accept",
    "trip.status"
  ],
  dispatch: ["dispatch"],
  finance: [
    "finance.read",
    "finance.write",
    "finance.payable.read.own",
    "finance.payable.proof.own"
  ],
  pricing: ["pricing.read", "pricing.write"],
  erp: ["erp.mapping.read", "erp.mapping.write", "erp.jobs.enqueue", "erp.jobs.process"],
  jobs: ["jobs.notifications.process", "jobs.reconcile.run"],
  admin: ["profiles.read", "notifications.read", "report.read", "audit.read"]
} as const;

export const ALL_CAPABILITIES = [
  ...CAPABILITY_GROUPS.trip,
  ...CAPABILITY_GROUPS.dispatch,
  ...CAPABILITY_GROUPS.finance,
  ...CAPABILITY_GROUPS.pricing,
  ...CAPABILITY_GROUPS.erp,
  ...CAPABILITY_GROUPS.jobs,
  ...CAPABILITY_GROUPS.admin,
  "driver.read",
  "vehicle.read",
  "vehicle.write",
  "client.read",
  "client.write",
  "location.write",
  "*"
] as const;

export type Capability = (typeof ALL_CAPABILITIES)[number];

/** Capabilities planeadas (ainda não ligadas a rotas). */
export const PLANNED_CAPABILITIES = [
  "pricing.read",
  "pricing.write",
  "audit.read"
] as const;

export function capabilitiesForRole(role: UserRole): readonly string[] {
  if (role === "admin") return ["*"];
  if (role === "operador") {
    return [
      ...CAPABILITY_GROUPS.trip,
      ...CAPABILITY_GROUPS.dispatch,
      "driver.read",
      "vehicle.read",
      "vehicle.write",
      "client.read",
      "client.write",
      "location.write",
      ...CAPABILITY_GROUPS.erp,
      ...CAPABILITY_GROUPS.jobs,
      "profiles.read",
      "notifications.read"
    ];
  }
  if (role === "financeiro") {
    return [
      ...CAPABILITY_GROUPS.finance,
      "trip.read",
      "report.read",
      "erp.mapping.read",
      "erp.jobs.enqueue",
      "jobs.reconcile.run",
      "notifications.read"
    ];
  }
  if (role === "cliente") return [...CAPABILITY_GROUPS.trip.filter((c) => c.includes("own") || c === "trip.request")];
  if (role === "motorista") {
    return [
      "trip.read.assigned",
      "trip.accept",
      "trip.status",
      "location.write",
      "finance.payable.read.own",
      "finance.payable.proof.own"
    ];
  }
  return [];
}
