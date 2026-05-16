import { fail } from "@/lib/server/http";
import { getClientIp } from "@/lib/security/integration-guard";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { normalizePublicTrackToken } from "@/lib/public/track-token";
import { resolvePublicTrackSnapshot } from "@/lib/public/resolve-public-track";
import { publicTrackRevision } from "@/lib/public/track-revision";

const encoder = new TextEncoder();

function sse(data: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Stream público de acompanhamento. Mantém polling curto no servidor e envia
 * apenas quando há mudança relevante no snapshot; o cliente mantém polling HTTP
 * como fallback quando SSE não estiver disponível.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const ip = getClientIp(request) ?? "unknown";
    enforceRateLimit(`public-track-stream:${ip}`, 20, 60_000);

    const { token: raw } = await params;
    const token = normalizePublicTrackToken(raw);
    if (!token) {
      return fail("INVALID_TOKEN", "Token de acompanhamento invalido", 400);
    }

    const initial = await resolvePublicTrackSnapshot(token);
    if (!initial) {
      return fail("TRACK_NOT_FOUND", "Link expirado ou invalido", 404);
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let revision = publicTrackRevision(initial);
        let closed = false;
        let interval: ReturnType<typeof setInterval> | undefined;
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const close = () => {
          if (closed) return;
          closed = true;
          if (interval) clearInterval(interval);
          if (timeout) clearTimeout(timeout);
          controller.close();
        };

        controller.enqueue(sse({ success: true, data: initial }));

        interval = setInterval(() => {
          void (async () => {
            if (closed) return;
            const snapshot = await resolvePublicTrackSnapshot(token);
            if (!snapshot) {
              controller.enqueue(sse({ success: false, error: { code: "TRACK_NOT_FOUND" } }));
              close();
              return;
            }

            const nextRevision = publicTrackRevision(snapshot);
            if (nextRevision !== revision) {
              revision = nextRevision;
              controller.enqueue(sse({ success: true, data: snapshot }));
            }
          })().catch((error) => {
            if (!closed) {
              controller.enqueue(
                sse({ success: false, error: { code: "TRACK_STREAM_FAILED", message: String(error) } })
              );
              close();
            }
          });
        }, 2_000);

        timeout = setTimeout(close, 55_000);
      }
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Rate limit exceeded")) {
      return fail("RATE_LIMIT", message, 429);
    }
    return fail("TRACK_STREAM_FAILED", message, 500);
  }
}
