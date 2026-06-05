import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { asUserRole, roleFromJwtClaims } from "../auth/role-from-claims";
import type { SessionContext, UserRole } from "../domain/types";
import { DEFAULT_TENANT_ID } from "../tenant/default-tenant";
import { createSupabaseRouteClient } from "../supabase/server";
import { resolveDriverIdForUser } from "@/lib/drivers/resolve-driver-for-session";
import { db } from "./db";
import { trustHeaderAuth } from "./trust-header-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function parseTenantHeader(h: Headers): string | undefined {
  const v = h.get("x-tenant-id");
  if (!v || !/^[0-9a-f-]{36}$/i.test(v)) return undefined;
  return v;
}

async function sessionContextFromUser(user: User): Promise<SessionContext> {
  const h = await headers();
  const { data: profile } = await db.from("profiles").select("role, tenant_id, client_id").eq("id", user.id).maybeSingle();

  const roleFromJwt = asUserRole(profile?.role) ?? roleFromJwtClaims(user);

  const tenantId = (profile?.tenant_id as string | undefined) ?? DEFAULT_TENANT_ID;
  let driverId = h.get("x-driver-id") ?? undefined;
  if (roleFromJwt === "motorista" && !driverId) {
    driverId = await resolveDriverIdForUser({
      userId: user.id,
      tenantId,
      email: user.email
    });
  }

  return {
    userId: user.id,
    role: roleFromJwt,
    email: user.email ?? undefined,
    tenantId,
    clientId: h.get("x-client-id") ?? (profile?.client_id as string | undefined) ?? undefined,
    driverId
  };
}

async function trySessionFromCookies(): Promise<SessionContext | null> {
  if (!supabaseUrl || !anonKey) return null;
  try {
    const cookieClient = await createSupabaseRouteClient();
    const {
      data: { user },
      error
    } = await cookieClient.auth.getUser();
    if (error || !user) return null;
    return sessionContextFromUser(user);
  } catch {
    return null;
  }
}

/**
 * Resolve sessao: JWT `Authorization: Bearer` + `profiles`, depois cookies Supabase,
 * depois cabecalhos `x-role` / `x-user-id` quando `trustHeaderAuth()`.
 * Em `production` sem trust e sem JWT/cookies validos, retorna `guest`.
 */
export async function getSessionContext(): Promise<SessionContext> {
  const h = await headers();
  const authHeader = h.get("authorization");
  const bearer = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  const allowHeaders = trustHeaderAuth();

  if (bearer && supabaseUrl && anonKey) {
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await authClient.auth.getUser(bearer);
    if (!error && data.user) {
      return sessionContextFromUser(data.user);
    }
  }

  const fromCookies = await trySessionFromCookies();
  if (fromCookies) {
    return fromCookies;
  }

  if (!allowHeaders) {
    return { userId: "anonymous", role: "guest" };
  }

  return {
    userId: h.get("x-user-id") ?? "system-user",
    role: (h.get("x-role") ?? "admin") as UserRole,
    tenantId: parseTenantHeader(h) ?? DEFAULT_TENANT_ID,
    clientId: h.get("x-client-id") ?? undefined,
    driverId: h.get("x-driver-id") ?? undefined
  };
}
