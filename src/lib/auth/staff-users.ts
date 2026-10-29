import { randomInt } from "node:crypto";
import { db } from "@/lib/server/db";

export const STAFF_ROLES = ["admin", "operador", "financeiro"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export class StaffUserError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

/** Senha provisória legível (sem 0/O, 1/l): 10 caracteres. */
export function temporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[randomInt(chars.length)];
  return out;
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Cria (ou reaproveita) o login de alguém da equipe com papel admin, operador ou financeiro. */
export async function createStaffUser(input: {
  tenantId: string;
  name: string;
  email: string;
  phone?: string | null;
  role: StaffRole;
}): Promise<{ id: string; email: string; password: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new StaffUserError("INVALID_EMAIL", "E-mail inválido.");
  const password = temporaryPassword();
  const admin = db.auth.admin;

  let userId = await findAuthUserIdByEmail(email);
  if (userId) {
    const { data: prof } = await db.from("profiles").select("role, tenant_id").eq("id", userId).maybeSingle();
    if (prof && (prof.tenant_id !== input.tenantId || !STAFF_ROLES.includes(prof.role as StaffRole))) {
      throw new StaffUserError(
        "EMAIL_IN_USE",
        "Este e-mail já é usado por um cliente ou motorista. Use outro e-mail para a equipe.",
        409
      );
    }
    const { error } = await admin.updateUserById(userId, {
      password,
      email_confirm: true,
      app_metadata: { role: input.role },
      user_metadata: { full_name: input.name },
      ban_duration: "none"
    });
    if (error) throw new StaffUserError("AUTH_FAILED", error.message, 502);
  } else {
    const { data, error } = await admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: input.role },
      user_metadata: { full_name: input.name, role: input.role }
    });
    if (error || !data.user) throw new StaffUserError("AUTH_FAILED", error?.message ?? "Não foi possível criar o login.", 502);
    userId = data.user.id;
  }

  const { error: pErr } = await db.from("profiles").upsert(
    {
      id: userId,
      tenant_id: input.tenantId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      role: input.role,
      client_id: null,
      active: true
    },
    { onConflict: "id" }
  );
  if (pErr) throw new StaffUserError("PROFILE_FAILED", pErr.message, 500);
  return { id: userId, email, password };
}
