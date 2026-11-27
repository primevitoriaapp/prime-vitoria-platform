import { z } from "zod";
import { recordAppError } from "@/lib/errors/record-app-error";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  message: z.string().max(2000),
  path: z.string().max(500).optional(),
  digest: z.string().max(100).optional(),
  role: z.string().max(30).optional()
});

/** Erro que aconteceu na tela de alguém (painel, app do motorista, portal). Sem login: só guarda o texto do erro. */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    enforceRateLimit(`client-errors:${ip}`, 20, 60_000);
    const b = schema.parse(await request.json());
    await recordAppError({ source: "tela", message: b.message, path: b.path ?? null, digest: b.digest ?? null, role: b.role ?? null, userAgent: request.headers.get("user-agent") });
  } catch {
    /* silencioso */
  }
  return new Response(null, { status: 204 });
}
