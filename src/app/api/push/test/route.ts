import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { getVapidKeys } from "@/lib/push/web-push";
import { encryptPushPayload, vapidAuthorization } from "@/lib/push/web-push-crypto";

/** Manda um aviso de teste para este aparelho. */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(await request.json());
    const { data: sub } = await db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("endpoint", endpoint).eq("profile_id", session.userId).maybeSingle();
    if (!sub) return fail("NOT_SUBSCRIBED", "Este aparelho não está com avisos ativados", 404);
    const keys = await getVapidKeys();
    const msg = { title: "Prime Vitória", body: "Avisos ativados neste aparelho ✓", url: session.role === "motorista" ? "/driver" : "/dashboard", tag: "teste" };
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(sub.endpoint, keys, "mailto:contato@primevitoria.com"),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "600",
        Urgency: "high"
      },
      body: new Uint8Array(encryptPushPayload(Buffer.from(JSON.stringify(msg)), sub))
    });
    if (!res.ok) return fail("PUSH_FAILED", `O serviço de avisos respondeu ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`, 502);
    return ok({ sent: true });
  } catch (error) {
    return mapApiError(error);
  }
}
