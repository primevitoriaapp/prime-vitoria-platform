import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { readPortalInviteToken } from "@/lib/auth/portal-invite-token";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const schema = z.object({ token: z.string().min(10).max(600) });

/**
 * Troca o convite (7 dias) por um acesso de "criar senha" novinho, na hora do clique.
 * Público: quem tem o convite é a pessoa convidada.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    enforceRateLimit(`portal-invite:${ip}`, 20, 10 * 60_000);
    const { token } = schema.parse(await request.json());
    const inv = readPortalInviteToken(token);
    if (inv === "invalid") return fail("INVITE_INVALID", "Este convite não é válido. Peça um convite novo à Prime.", 400);
    if (inv === "expired") return fail("INVITE_EXPIRED", "Este convite venceu (vale 7 dias). Peça um convite novo à Prime.", 410);

    const { data: u, error } = await db.auth.admin.getUserById(inv.userId);
    if (error || !u.user?.email) return fail("INVITE_INVALID", "Este convite não é válido. Peça um convite novo à Prime.", 400);
    const { data: prof } = await db.from("profiles").select("active").eq("id", inv.userId).maybeSingle();
    if (prof && prof.active === false) return fail("ACCESS_REVOKED", "Este acesso foi desativado. Fale com o gestor da sua empresa.", 403);
    // Já entrou depois deste convite: a senha já foi criada.
    const last = u.user.last_sign_in_at ? Date.parse(u.user.last_sign_in_at) : 0;
    if (last > inv.issuedAt) {
      return fail("INVITE_USED", "Você já criou sua senha. Entre com seu e-mail e senha, ou use “Esqueci minha senha”.", 409);
    }
    const { data, error: linkErr } = await db.auth.admin.generateLink({ type: "recovery", email: u.user.email });
    const hashed = data?.properties?.hashed_token;
    if (linkErr || !hashed) return fail("LINK_FAILED", "Não foi possível abrir agora. Tente de novo em 1 minuto.", 502);
    return ok({ token_hash: hashed, email: u.user.email });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("INVITE_INVALID", "Convite inválido.", 400);
    if (e instanceof Error && /rate/i.test(e.message)) return fail("RATE_LIMIT", "Muitas tentativas. Aguarde alguns minutos.", 429);
    return fail("INTERNAL", "Erro ao abrir o convite. Tente de novo.", 500);
  }
}
