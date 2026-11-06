import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/server/db";
import { sendOperationalEmail, DEFAULT_EMAIL_REPLY_TO } from "@/lib/notifications/send-email";
import { buildPortalWelcomeEmail } from "@/lib/notifications/portal-welcome-email";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";
import { createPortalInviteToken } from "@/lib/auth/portal-invite-token";

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

/**
 * Boas-vindas da Prime (com logo e o que dá para fazer no portal) com o link seguro para criar a senha.
 * Sem senha padrão por e-mail: cada pessoa cria a sua. Devolve false se não conseguiu enviar.
 */
async function sendWelcome(opts: { email: string; name: string; clientId: string; access: "gestor" | "solicitante"; link: string }): Promise<boolean> {
  const { data: c } = await db.from("clients").select("name, trade_name").eq("id", opts.clientId).maybeSingle();
  const company = ((c?.trade_name as string | null) || (c?.name as string | null) || "sua empresa").trim();
  const mail = buildPortalWelcomeEmail({
    name: opts.name,
    company,
    access: opts.access,
    link: opts.link,
    portalUrl: OFFICIAL_URLS.empresa,
    logoUrl: `${OFFICIAL_URLS.central}/api/public/brand-logo`,
    phones: "(27) 2142-8307 | (27) 99806-3956"
  });
  // O convite leva um link pessoal de criar senha: vai SÓ para o funcionário.
  // A Prime recebe um aviso separado, sem o link (quem clicasse na cópia entraria na conta dele).
  const r = await sendOperationalEmail({ to: opts.email, subject: mail.subject, text: mail.text, html: mail.html, replyTo: DEFAULT_EMAIL_REPLY_TO });
  if (r.ok) {
    const nivel = opts.access === "gestor" ? "gestor" : "solicitante";
    await sendOperationalEmail({
      to: "contato@primevitoria.com",
      subject: `Convite do portal enviado: ${opts.name} · ${company}`,
      text: `Aviso interno (não é preciso fazer nada).\n\nO convite do Portal Prime Vitória foi enviado para ${opts.name} (${opts.email}), da ${company}, como ${nivel}.\nEle(a) recebeu o link pessoal para criar a senha. Por segurança, o link não vai nesta cópia.\n\nSe ele(a) não achar o e-mail, peça para olhar o spam ou reenvie o convite pelo cadastro do cliente.`
    }).catch(() => null);
  }
  return r.ok;
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
  /** gestor = responsável: vê tudo da empresa e cadastra a equipe. Padrão: solicitante. */
  access?: "gestor" | "solicitante";
  /** Só mudar o nível de quem já tem login, sem mandar e-mail de senha. */
  skipEmail?: boolean;
}): Promise<{ email: string; invited: boolean; welcomed: boolean }> {
  const access = input.access === "gestor" ? "gestor" : "solicitante";
  const email = normalizePortalEmail(input.email);
  const passenger = await loadPassenger(input.passengerId, input.clientId, input.tenantId);
  const admin = db.auth.admin;
  const metadata = { role: "cliente", full_name: passenger.name };

  let userId = await findAuthUserIdByEmail(email);
  let invited = false;
  let inviteLink: string | null = null;

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
      if (gestor?.client_access === "gestor" && access !== "gestor") {
        throw new PortalAccessError("EMAIL_IS_MANAGER", "Este e-mail já é o gestor da conta.", 409);
      }
    }
  } else {
    // Cria o login e gera o link de "criar senha"; o e-mail sai com a cara da Prime (não o padrão do sistema).
    const { data, error } = await admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${input.origin}/redefinir-senha`, data: metadata }
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
    inviteLink = data.properties?.action_link ?? null;
  }

  await admin.updateUserById(userId, { app_metadata: { role: "cliente" } });

  const { error: profileErr } = await db.from("profiles").upsert(
    {
      id: userId,
      tenant_id: input.tenantId,
      name: passenger.name,
      role: "cliente",
      client_id: input.clientId,
      client_access: access,
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

  let welcomed = false;
  if (!input.skipEmail) {
    // Link nosso, válido por 7 dias (o do sistema vence em 1 hora e o antivírus do
    // e-mail corporativo às vezes "gasta" ele antes da pessoa clicar).
    void inviteLink;
    const link = `${input.origin}/redefinir-senha?convite=${encodeURIComponent(createPortalInviteToken(userId))}`;
    if (link) welcomed = await sendWelcome({ email, name: passenger.name, clientId: input.clientId, access, link }).catch(() => false);
    // Plano B: e-mail padrão de senha do sistema.
    if (!welcomed) {
      if (invited) await admin.inviteUserByEmail(email, { redirectTo: `${input.origin}/redefinir-senha`, data: metadata }).catch(() => undefined);
      else await sendPasswordLink(email, input.origin);
    }
  }

  return { email, invited, welcomed };
}

/** Tira o acesso ao portal (o cadastro do funcionário continua). */
export async function revokePortalAccess(input: { passengerId: string; clientId: string; tenantId: string }) {
  const passenger = await loadPassenger(input.passengerId, input.clientId, input.tenantId);
  if (passenger.profile_id) {
    await db
      .from("profiles")
      .update({ active: false })
      .eq("id", passenger.profile_id)
      .eq("client_id", input.clientId);
  }
  await db
    .from("client_passengers")
    .update({ profile_id: null, updated_at: new Date().toISOString() })
    .eq("id", passenger.id);
}
