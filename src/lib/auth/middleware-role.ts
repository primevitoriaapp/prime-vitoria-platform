import type { User } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/domain/types";
import { normalizeEmailForDriverMatch } from "@/lib/drivers/resolve-driver-for-session";
import { asUserRole, roleFromJwtClaims } from "@/lib/auth/role-from-claims";
import { roleFromProfileField } from "@/lib/auth/role-from-claims";

type ProfileRow = { role: string; client_id?: string | null };
type DriverRow = { id: string; email?: string | null; profile_id?: string | null };

function serviceHeaders(key: string): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json"
  };
}

/** Resolve papel no middleware (Edge): perfil Supabase + vínculo motorista por e-mail. */
export async function resolveMiddlewareRole(user: User): Promise<UserRole> {
  const cached =
    asUserRole(user.user_metadata?.role) ?? asUserRole(user.app_metadata?.role);
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return roleFromJwtClaims(user);

  try {
    const profileRes = await fetch(
      `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,client_id&limit=1`,
      { headers: serviceHeaders(key), cache: "no-store" }
    );
    if (profileRes.ok) {
      const rows = (await profileRes.json()) as ProfileRow[];
      const profileRole = roleFromProfileField(rows[0]?.role);
      if (profileRole) return profileRole;
      if (rows[0]?.client_id) return "cliente";
    }

    const email = user.email?.trim();
    if (email) {
      const normalized = normalizeEmailForDriverMatch(email);
      const driverRes = await fetch(
        `${url}/rest/v1/drivers?select=id,email,profile_id&email=not.is.null&limit=500`,
        { headers: serviceHeaders(key), cache: "no-store" }
      );
      if (driverRes.ok) {
        const drivers = (await driverRes.json()) as DriverRow[];
        const hit = drivers.find(
          (d) =>
            d.email &&
            normalizeEmailForDriverMatch(String(d.email)) === normalized &&
            (!d.profile_id || d.profile_id === user.id)
        );
        if (hit) return "motorista";
      }
    }
  } catch {
    /* fallback abaixo */
  }

  return roleFromJwtClaims(user);
}
