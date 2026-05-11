import { enforceRateLimit } from "./rate-limit.ts";

/** Primeiro IP do cliente (proxy / CDN). */
export function getClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return null;
}

/**
 * Se `ERP_INTEGRATION_ALLOWED_IPS` estiver definido (lista separada por virgula),
 * apenas esses IPs podem chamar integracao. Lista vazia = sem restricao.
 */
export function assertIntegrationIpAllowed(request: Request): void {
  const raw = process.env.ERP_INTEGRATION_ALLOWED_IPS?.trim();
  if (!raw) return;

  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const ip = getClientIp(request);
  if (!ip || !allowed.has(ip)) {
    throw new Error("Integration access denied for this IP address");
  }
}

export function rateLimitIntegration(request: Request, suffix: string): void {
  const ip = getClientIp(request) ?? "unknown";
  enforceRateLimit(`integration:${ip}:${suffix}`, 120, 60_000);
}

/** IP allowlist (se configurada) + rate limit por IP + sufixo. */
export function runIntegrationGuards(request: Request, rateSuffix: string): void {
  assertIntegrationIpAllowed(request);
  rateLimitIntegration(request, rateSuffix);
}
