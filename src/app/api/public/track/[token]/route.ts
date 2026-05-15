import { fail, ok } from "@/lib/server/http";
import { getClientIp } from "@/lib/security/integration-guard";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { normalizePublicTrackToken } from "@/lib/public/track-token";
import { resolvePublicTrackSnapshot } from "@/lib/public/resolve-public-track";

/**
 * Acompanhamento publico por token (sem JWT). Rate limit por IP.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const ip = getClientIp(_request) ?? "unknown";
    enforceRateLimit(`public-track:${ip}`, 60, 60_000);

    const { token: raw } = await params;
    if (!normalizePublicTrackToken(raw)) {
      return fail("INVALID_TOKEN", "Token de acompanhamento invalido", 400);
    }

    const snapshot = await resolvePublicTrackSnapshot(raw);
    if (!snapshot) {
      return fail("TRACK_NOT_FOUND", "Link expirado ou invalido", 404);
    }

    return ok(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Rate limit exceeded")) {
      return fail("RATE_LIMIT", message, 429);
    }
    return fail("TRACK_FETCH_FAILED", message, 500);
  }
}
