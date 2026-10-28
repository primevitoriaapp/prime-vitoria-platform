import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/server/db";

export class PortalAccessError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export function normalizePortalEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new PortalAccessError("INVALID_EMAIL", "Informe um e-mail válido.");
  }
  return email;
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = db.auth.admin;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Envia o e-mail "criar/redefinir senha" para quem já tem conta. */
async function sendPasswordLink(email: string, origin: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  const anon = createClient(url, key, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  await anon.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/redefinir-senha` });
}

type PassengerRow = { id: string; name: string; client_id: string; tenant_id: string; profile_id: string | null };

async function loadPassenger(passengerId: string, clientId: string, tenantId: string): Promise<PassengerRow> {
  const { data } = await db
    .from("client_passengers")
    .select("id, name, client_id, tenant_id, profile_id")
    .eq("id", passengerId)
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) throw new PortalAccessError("PASSENGER_NOT_FOUND", "Funcionário não encontrado.", 404);
  return data as PassengerRow;
}

/**
 * Dá acesso ao portal para um funcionário cadastrado pelo gestor.
 * Cria o login (convite por e-mail) com papel cliente/solicitante, preso à empresa.
 */
export async function grantPortalAccess(input: {
  passengerId: string;
  clientId: string;
  tenantId: string;
  email: string;
  origin: string;
}): Promise<{ email: string; invited: boolean }> {
  const email = normalizePortalEmail(input.email);
  const passenger = await loadPassenger(input.passengerId, input.clientId, input.tenantId);
  const admin = db.auth.admin;
  const metadata = { role: "cliente", full_name: passenger.name };

  let userId = await findAuthUserIdByEmail(email);
  let invited = false;

  if (userId) {
    const { data: existing } = await db
      .from("profiles")
      .select("id, role, client_id")
      .eq("id", userId)
      .maybeSingle();
    if (existing && (existing.role !== "cliente" || existing.client_id !== input.clientId)) {
      throw new PortalAccessError(
        "EMAIL_IN_USE",
        "Este e-mail já é usado por outra conta. Use outro e-mail para este funcionário.",
        409
      );
    }
    if (existing?.role === "cliente" && existing.client_id === input.clientId) {
      const { data: gestor } = await db.from("profiles").select("client_access").eq("id", userId).maybeSingle();
      if (gestor?.client_access === "gestor") {
        throw new PortalAccessError("EMAIL_IS_MANAGER", "Este e-mail já é o gestor da conta.", 409);
      }
    }
  } else {
    const { data, error } = await admin.inviteUserByEmail(email, {
      redirectTo: `${input.origin}/redefinir-senha`,
      data: metadata
    });
    if (error || !data.user) {
      throw new PortalAccessError(
        "INVITE_FAILED",
        /rate limit/i.test(error?.message ?? "")
          ? "Limite de e-mails atingido. Tente de novo em alguns minutos."
          : "Não foi possível enviar o convite. Tente de novo.",
        502
      );
    }
    userId = data.user.id;
    invited = true;
  }

  await admin.updateUserById(userId, { app_metadata: { role: "cliente" } });

  const { error: profileErr } = await db.from("profiles").upsert(
    {
      id: userId,
      tenant_id: input.tenantId,
      name: passenger.name,
      role: "cliente",
      client_id: input.clientId,
      client_access: "solicitante",
      active: true
    },
    { onConflict: "id" }
  );
  if (profileErr) throw new PortalAccessError("PROFILE_FAILED", profileErr.message, 500);

  const { error: linkErr } = await db
    .from("client_passengers")
    .update({ email, profile_id: userId, updated_at: new Date().toISOString() })
    .eq("id", passenger.id);
  if (linkErr) throw new PortalAccessError("LINK_FAILED", linkErr.message, 500);

  if (!invited) await sendPasswordLink(email, input.origin);

  return { email, invited };
}

/** Tira o acesso ao portal (o cadastro do funcionário continua). */
export async function revokePortalAccess(input: { passengerId: string; clientId: string; tenantId: string }) {
  const passenger = await loadPassenger(input.passengerId, input.clientId, input.tenantId);
  if (passenger.profile_id) {
    await db
      .from("profiles")
      .update({ active: false })
      .eq("id", passenger.profile_id)
      .eq("client_id", input.clientId)
      .eq("client_access", "solicitante");
  }
  await db
    .from("client_passengers")
    .update({ profile_id: null, updated_at: new Date().toISOString() })
    .eq("id", passenger.id);
}
