import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Erro não tratado numa página ou rota: Sentry (se configurado) e a tabela de erros da checagem diária. */
export const onRequestError: typeof Sentry.captureRequestError = async (error, request, context) => {
  try {
    if (process.env.NEXT_RUNTIME !== "nodejs") return Sentry.captureRequestError(error, request, context);
    const { recordAppError } = await import("./src/lib/errors/record-app-error");
    const e = error as { message?: string; digest?: string };
    await recordAppError({ source: "servidor", message: e?.message ?? String(error), path: request.path, digest: e?.digest ?? null, code: context.routeType });
  } catch {
    /* ignora */
  }
  return Sentry.captureRequestError(error, request, context);
};
