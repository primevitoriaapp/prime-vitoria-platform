import { db } from "@/lib/server/db";
import { newFeedToken } from "@/lib/integrations/calendar-feed";

const keyFor = (tenantId: string) => `calendar_feed:${tenantId}`;

export async function getFeedToken(tenantId: string): Promise<string | null> {
  const { data } = await db.from("app_secrets").select("value").eq("key", keyFor(tenantId)).maybeSingle();
  return ((data?.value as { token?: string } | null)?.token as string | undefined) ?? null;
}

/** Cria (ou troca, invalidando o link antigo) o link secreto da agenda. */
export async function rotateFeedToken(tenantId: string): Promise<string> {
  const token = newFeedToken();
  const { error } = await db.from("app_secrets").upsert({ key: keyFor(tenantId), value: { token, created_at: new Date().toISOString() } });
  if (error) throw new Error(error.message);
  return token;
}

export async function tenantForFeedToken(token: string): Promise<string | null> {
  const { data } = await db
    .from("app_secrets")
    .select("key")
    .like("key", "calendar_feed:%")
    .filter("value->>token", "eq", token)
    .maybeSingle();
  const k = data?.key as string | undefined;
  return k ? k.slice("calendar_feed:".length) : null;
}
