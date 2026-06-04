import { ZodError } from "zod";
import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data, meta: { timestamp: new Date().toISOString() } }, { status });
}

export function fail(code: string, message: string, status = 400, hint?: string) {
  return NextResponse.json(
    { success: false, error: { code, message, ...(hint ? { hint } : {}) } },
    { status }
  );
}

/** Resposta JSON para excecoes de rota (ex.: `assertCapability` -> 403). */
export function mapApiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Forbidden:")) {
    const detail = message.replace(/^Forbidden:\s*/, "");
    const friendly =
      detail.includes("missing capability") ? "Sem permissão para esta acção." : detail;
    return fail("FORBIDDEN", friendly, 403);
  }
  if (message.includes("autenticacao necessaria")) {
    return fail("UNAUTHORIZED", "Sessão expirada ou inválida. Inicie sessão novamente.", 401);
  }
  if (message.includes("Pricing feature disabled")) {
    return fail("PRICING_FEATURE_DISABLED", "Funcionalidade de precificação não activa.", 422);
  }
  if (message.includes("no_active_pricing_rule") || message.includes("skipped_reason")) {
    return fail("PRICING_NOT_APPLIED", "Precificação automática não aplicada nesta corrida.", 422);
  }
  if (message.includes("Trip not found")) {
    return fail("TRIP_NOT_FOUND", "Corrida não encontrada.", 404);
  }
  if (message.includes("INVALID_STATUS_TRANSITION") || message.includes("Cannot transition")) {
    return fail("INVALID_STATUS_TRANSITION", "Transição de estado não permitida.", 409);
  }
  if (message.includes("Tenant mismatch") || message.includes("tenant scope")) {
    return fail("TENANT_FORBIDDEN", "Recurso fora do âmbito da sua empresa.", 403);
  }
  if (error instanceof ZodError) {
    const detail = error.errors.map((e) => `${e.path.join(".") || "campo"}: ${e.message}`).join(" · ");
    return fail("VALIDATION_ERROR", `Dados inválidos — ${detail}`, 422);
  }
  return fail("INVALID_REQUEST", message, 400);
}
