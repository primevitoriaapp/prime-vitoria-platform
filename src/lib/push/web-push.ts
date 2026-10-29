import { db } from "@/lib/server/db";
import { encryptPushPayload, generateVapidKeys, vapidAuthorization, type VapidKeys } from "@/lib/push/web-push-crypto";

export type PushMessage = { title: string; body: string; url?: string; tag?: string; tripId?: string };

let cachedKeys: VapidKeys | null = null;

/** Chaves VAPID do sistema: criadas uma vez e guardadas no banco (sem configurar nada na hospedagem). */
export async function getVapidKeys(): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys;
  const { data } = await db.from("app_secrets").select("value").eq("key", "vapid").maybeSingle();
  if (data?.value?.publicKey && data?.value?.privateKey) {
    cachedKeys = data.value as VapidKeys;
    return cachedKeys;
  }
  const keys = generateVapidKeys();
  const { error } = await db.from("app_secrets").insert({ key: "vapid", value: keys });
  if (error) {
    // Outra instância criou ao mesmo tempo: usa a dela.
    const again = await db.from("app_secrets").select("value").eq("key", "vapid").maybeSingle();
    if (again.data?.value) {
      cachedKeys = again.data.value as VapidKeys;
      return cachedKeys;
    }
    throw new Error(error.message);
  }
  cachedKeys = keys;
  return keys;
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

async function sendOne(sub: SubRow, msg: PushMessage, keys: VapidKeys): Promise<boolean> {
  try {
    const body = encryptPushPayload(Buffer.from(JSON.stringify(msg)), sub);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(sub.endpoint, keys, "mailto:contato@primevitoria.com"),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "high"
      },
      body: new Uint8Array(body)
    });
    if (res.status === 404 || res.status === 410) {
      await db.from("push_subscriptions").delete().eq("id", sub.id);
      return false;
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      await db.from("push_subscriptions").update({ last_error: `${res.status} ${t.slice(0, 200)}` }).eq("id", sub.id);
      return false;
    }
    await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), last_error: null }).eq("id", sub.id);
    return true;
  } catch (e) {
    await db.from("push_subscriptions").update({ last_error: e instanceof Error ? e.message.slice(0, 200) : "erro" }).eq("id", sub.id);
    return false;
  }
}

async function sendMany(subs: SubRow[], msg: PushMessage): Promise<number> {
  if (!subs.length) return 0;
  const keys = await getVapidKeys();
  const results = await Promise.all(subs.map((s) => sendOne(s, msg, keys)));
  return results.filter(Boolean).length;
}

/** Aviso no celular do motorista (todas as assinaturas dele). Devolve quantos aparelhos receberam. */
export async function pushToDriver(tenantId: string, driverId: string, msg: PushMessage): Promise<number> {
  const { data } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("tenant_id", tenantId).eq("driver_id", driverId);
  return sendMany((data ?? []) as SubRow[], msg);
}

export async function pushToProfiles(tenantId: string, profileIds: string[], msg: PushMessage): Promise<number> {
  if (!profileIds.length) return 0;
  const { data } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("tenant_id", tenantId).in("profile_id", profileIds).is("driver_id", null);
  return sendMany((data ?? []) as SubRow[], msg);
}

/** Aviso para a central (admin/operador) nos aparelhos onde ativaram. */
export async function pushToStaff(tenantId: string, msg: PushMessage, roles = ["admin", "operador"]): Promise<number> {
  const { data } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("tenant_id", tenantId).is("driver_id", null).in("role", roles);
  return sendMany((data ?? []) as SubRow[], msg);
}
