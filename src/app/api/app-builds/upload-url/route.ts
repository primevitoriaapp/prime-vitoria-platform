import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";

const BUCKET = "app-builds";
const schema = z.object({ token: z.string().min(20).max(200), name: z.string().regex(/^[a-z0-9-]{3,60}$/) });

/**
 * O build automático (GitHub) pede aqui um link para subir o APK direto no armazenamento.
 * Vale só com a senha de uso único criada pela central (app_secrets.app_upload), que expira.
 */
export async function POST(request: Request) {
  try {
    const { token, name } = schema.parse(await request.json());
    const { data } = await db.from("app_secrets").select("value").eq("key", "app_upload").maybeSingle();
    const v = (data?.value ?? {}) as { token_sha256?: string; expires_at?: string; used?: boolean };
    const got = createHash("sha256").update(token).digest("hex");
    const want = String(v.token_sha256 ?? "");
    const valid = want.length === got.length && timingSafeEqual(Buffer.from(want), Buffer.from(got)) && !v.used && Date.parse(v.expires_at ?? "") > Date.now();
    if (!valid) return fail("UNAUTHORIZED", "Senha de envio inválida ou vencida", 401);
    await db.from("app_secrets").update({ value: { ...v, used: true } }).eq("key", "app_upload");
    const path = `driver/${name}.apk`;
    const { data: up, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !up) return fail("UPLOAD_URL_FAILED", error?.message ?? "Falhou", 500);
    return ok({ path, signedUrl: up.signedUrl });
  } catch {
    return fail("INVALID_BODY", "Dados inválidos", 400);
  }
}
