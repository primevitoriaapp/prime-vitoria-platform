import { db } from "@/lib/server/db";
import { deriveDriverAuthPassword } from "@/lib/auth/driver-pin-crypto";
import { normalizeCpfDigits } from "@/lib/drivers/resolve-driver-for-session";

type DriverAuthRow = {
  id: string;
  cpf: string;
  email?: string | null;
  full_name?: string | null;
  profile_id?: string | null;
  tenant_id: string;
};

function driverAuthEmail(driver: DriverAuthRow): string {
  const email = driver.email?.trim().toLowerCase();
  if (email && email.includes("@")) return email;
  const cpf = normalizeCpfDigits(driver.cpf);
  return `motorista.${cpf}@acesso.primevitoria.com.br`;
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = db.auth.admin;
  let page = 1;
  const perPage = 200;
  const target = email.toLowerCase();
  while (page <= 50) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

/**
 * Garante utilizador Supabase + perfil motorista para login por PIN.
 * A senha interna é derivada do id do motorista (não é o PIN).
 */
export async function ensureDriverAuthAccount(driver: DriverAuthRow): Promise<{
  userId: string;
  email: string;
  password: string;
}> {
  const email = driverAuthEmail(driver);
  const password = deriveDriverAuthPassword(driver.id);
  const displayName = (driver.full_name ?? "Motorista").trim() || "Motorista";
  const metadata = {
    role: "motorista",
    full_name: displayName,
    cpf: normalizeCpfDigits(driver.cpf)
  };

  const admin = db.auth.admin;
  let userId = driver.profile_id ?? null;

  if (userId) {
    const { data, error } = await admin.getUserById(userId);
    if (error || !data.user) {
      userId = null;
    }
  }

  if (!userId) {
    userId = await findAuthUserIdByEmail(email);
  }

  if (userId) {
    const { error } = await admin.updateUserById(userId, {
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "motorista" },
      user_metadata: metadata
    });
    if (error) throw error;
  } else {
    const { data, error } = await admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "motorista" },
      user_metadata: metadata
    });
    if (error) {
      const existing = await findAuthUserIdByEmail(email);
      if (!existing) throw error;
      userId = existing;
      const { error: updateErr } = await admin.updateUserById(userId, {
        password,
        email_confirm: true,
        app_metadata: { role: "motorista" },
        user_metadata: metadata
      });
      if (updateErr) throw updateErr;
    } else {
      userId = data.user.id;
    }
  }

  const { error: profileErr } = await db.from("profiles").upsert(
    {
      id: userId,
      tenant_id: driver.tenant_id,
      name: displayName,
      role: "motorista",
      active: true,
      client_id: null
    },
    { onConflict: "id" }
  );
  if (profileErr) throw profileErr;

  if (!driver.profile_id || driver.profile_id !== userId) {
    const { error: linkErr } = await db
      .from("drivers")
      .update({ profile_id: userId })
      .eq("id", driver.id)
      .eq("tenant_id", driver.tenant_id);
    if (linkErr) throw linkErr;
  }

  return { userId, email, password };
}
