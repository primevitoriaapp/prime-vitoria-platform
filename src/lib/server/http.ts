import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data, meta: { timestamp: new Date().toISOString() } }, { status });
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
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
    return fail("PRICING_FEATURE_DISABLED", message, 422);
  }
  if (message.includes("Trip not found")) {
    return fail("TRIP_NOT_FOUND", "Corrida não encontrada.", 404);
  }
  if (message.includes("INVALID_STATUS_TRANSITION") || message.includes("Cannot transition")) {
    return fail("INVALID_STATUS_TRANSITION", "Transição de estado não permitida.", 409);
  }
  return fail("INVALID_REQUEST", message, 400);
}
