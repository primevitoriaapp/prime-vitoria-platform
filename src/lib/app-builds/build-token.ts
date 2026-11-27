import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/server/db";

/** Senha de uso único que a central cria para o build automático (GitHub) falar com o sistema. */
export async function checkBuildToken(token: string, consume: boolean): Promise<boolean> {
  const { data } = await db.from("app_secrets").select("value").eq("key", "app_upload").maybeSingle();
  const v = (data?.value ?? {}) as { token_sha256?: string; expires_at?: string; used?: boolean };
  const got = createHash("sha256").update(token).digest("hex");
  const want = String(v.token_sha256 ?? "");
  const valid = want.length === got.length && timingSafeEqual(Buffer.from(want), Buffer.from(got)) && !v.used && Date.parse(v.expires_at ?? "") > Date.now();
  if (valid && consume) await db.from("app_secrets").update({ value: { ...v, used: true } }).eq("key", "app_upload");
  return valid;
}
