import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { checkBuildToken } from "@/lib/app-builds/build-token";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(20).max(200),
  /** Só no primeiro build: a chave gerada no próprio build, para guardar. */
  create: z.object({ keystore_b64: z.string().min(100).max(20000), password: z.string().min(16).max(200), alias: z.string().min(3).max(60) }).optional()
});

/**
 * Chave de assinatura do app (upload key da Play Store). Fica guardada só no banco;
 * o build pede com a senha de uso único. Nunca aparece em tela nem em log.
 */
export async function POST(request: Request) {
  try {
    const b = schema.parse(await request.json());
    if (!(await checkBuildToken(b.token, false))) return fail("UNAUTHORIZED", "Senha inválida ou vencida", 401);
    const { data } = await db.from("app_secrets").select("value").eq("key", "android_upload_key").maybeSingle();
    if (data?.value) return ok(data.value);
    if (!b.create) return ok(null);
    const value = { ...b.create, created_at: new Date().toISOString(), owner: "Prime Locadora & Serviços LTDA" };
    await db.from("app_secrets").insert({ key: "android_upload_key", value });
    return ok(value);
  } catch {
    return fail("INVALID_BODY", "Dados inválidos", 400);
  }
}
