import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Convite do portal com validade longa (7 dias).
 * O link "de verdade" do sistema de login vence em 1 hora e é gasto se o
 * antivírus do e-mail da empresa abrir o link antes da pessoa. Por isso o
 * e-mail leva este código nosso; o link de 1 hora só é gerado quando a
 * pessoa clica em "Criar minha senha" na nossa página.
 */
const DAYS = 7;

function secret(): string {
  const s = process.env.PORTAL_INVITE_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!s) throw new Error("PORTAL_INVITE_SECRET ausente");
  return s;
}

function sign(payload: string, key = secret()): string {
  return createHmac("sha256", `portal-invite:${key}`).update(payload).digest("base64url");
}

export function createPortalInviteToken(userId: string, now = Date.now(), key?: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, i: Math.floor(now / 1000), x: Math.floor(now / 1000) + DAYS * 86400 })).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

export type PortalInvite = { userId: string; issuedAt: number; expiresAt: number };

export function readPortalInviteToken(token: string, now = Date.now(), key?: string): PortalInvite | "invalid" | "expired" {
  const [payload, sig] = String(token ?? "").split(".");
  if (!payload || !sig) return "invalid";
  const want = Buffer.from(sign(payload, key));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return "invalid";
  let data: { u?: string; i?: number; x?: number };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return "invalid";
  }
  if (!data.u || !data.i || !data.x) return "invalid";
  if (now / 1000 > data.x) return "expired";
  return { userId: data.u, issuedAt: data.i * 1000, expiresAt: data.x * 1000 };
}
