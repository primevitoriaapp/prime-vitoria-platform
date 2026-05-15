import { db } from "../server/db";
import { enqueueNotificationJob } from "./events";

/** Enfileira notificações in-app para perfis do tenant com os papéis indicados. */
export async function enqueueInAppForTenantRoles(
  tenantId: string,
  roles: string[],
  payload: Omit<Record<string, unknown>, "channel" | "recipientType" | "recipientId">,
  opts?: { correlation_id?: string; excludeProfileIds?: string[] }
): Promise<number> {
  const exclude = new Set(opts?.excludeProfileIds ?? []);
  const { data: profiles, error } = await db
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("role", roles);

  if (error) {
    throw new Error(error.message);
  }

  let count = 0;
  for (const profile of profiles ?? []) {
    if (exclude.has(profile.id as string)) continue;
    await enqueueNotificationJob(
      {
        ...payload,
        channel: "in_app",
        recipientType: "profile",
        recipientId: profile.id as string
      },
      { tenantId, correlation_id: opts?.correlation_id }
    );
    count += 1;
  }
  return count;
}
