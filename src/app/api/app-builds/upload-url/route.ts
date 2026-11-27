import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { checkBuildToken } from "@/lib/app-builds/build-token";

export const runtime = "nodejs";

const BUCKET = "app-builds";
const schema = z.object({ token: z.string().min(20).max(200), name: z.string().regex(/^[a-z0-9-]{3,60}$/), kinds: z.array(z.enum(["apk", "aab"])).min(1).max(2).default(["apk"]) });

/**
 * O build automático (GitHub) pede aqui um link para subir o APK direto no armazenamento.
 * Vale só com a senha de uso único criada pela central (app_secrets.app_upload), que expira.
 */
export async function POST(request: Request) {
  try {
    const { token, name, kinds } = schema.parse(await request.json());
    if (!(await checkBuildToken(token, true))) return fail("UNAUTHORIZED", "Senha de envio inválida ou vencida", 401);
    const urls: Record<string, string> = {};
    for (const kind of kinds) {
      const { data: up, error } = await db.storage.from(BUCKET).createSignedUploadUrl(`driver/${name}.${kind}`, { upsert: true });
      if (error || !up) return fail("UPLOAD_URL_FAILED", error?.message ?? "Falhou", 500);
      urls[kind] = up.signedUrl;
    }
    // signedUrl continua no topo (compatível com o build antigo, que só manda APK).
    return ok({ signedUrl: urls.apk ?? urls.aab, urls });
  } catch {
    return fail("INVALID_BODY", "Dados inválidos", 400);
  }
}
