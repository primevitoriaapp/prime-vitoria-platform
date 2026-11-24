import { randomBytes } from "node:crypto";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { CLUB_CODE_MINUTES, clubValidateUrl, newClubCode } from "@/lib/club/club";
import { clubDriver } from "@/lib/club/driver-session";
import { enforceRateLimit } from "@/lib/security/rate-limit";

/** Gera o código dinâmico do QR da carteirinha (vale 5 minutos, uso único). */
export async function POST() {
  try {
    const { driver, denied } = await clubDriver();
    if (denied || !driver) return denied as Response;
    if (!driver.eligible) return fail("NOT_ELIGIBLE", driver.reason ?? "Sem acesso ao clube", 403);
    enforceRateLimit(`club-token:${driver.id}`, 30, 60 * 60_000);
    const expires = new Date(Date.now() + CLUB_CODE_MINUTES * 60_000).toISOString();
    for (let i = 0; i < 4; i++) {
      const code = newClubCode((n) => new Uint8Array(randomBytes(n)));
      const { error } = await db.from("club_tokens").insert({ tenant_id: driver.tenantId, driver_id: driver.id, code, expires_at: expires });
      if (!error) return ok({ code, url: clubValidateUrl(code), expires_at: expires });
    }
    return fail("TOKEN_ERROR", "Não foi possível gerar o código. Tente de novo.", 500);
  } catch (e) {
    return mapApiError(e);
  }
}
