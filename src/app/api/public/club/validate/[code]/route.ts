import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { verifyDriverPin } from "@/lib/auth/driver-pin-crypto";
import { benefitIsValid, partnerIsLive, savedAmount, type BenefitKind } from "@/lib/club/club";
import { memberNumber } from "@/lib/club/driver-session";
import { resolveDriverPhotoDisplayUrl } from "@/lib/storage/driver-photo-upload";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const MAX_ATTEMPTS = 5;

type Token = { id: string; tenant_id: string; driver_id: string; expires_at: string; used_at: string | null; attempts: number };

async function loadToken(code: string): Promise<Token | null> {
  if (!/^[A-Z0-9]{10}$/.test(code)) return null;
  const { data } = await db.from("club_tokens").select("id, tenant_id, driver_id, expires_at, used_at, attempts").eq("code", code).maybeSingle();
  return (data as Token | null) ?? null;
}

function tokenStatus(t: Token | null): "valido" | "expirado" | "usado" | "bloqueado" | "invalido" {
  if (!t) return "invalido";
  if (t.used_at) return "usado";
  if (t.attempts >= MAX_ATTEMPTS) return "bloqueado";
  if (new Date(t.expires_at) < new Date()) return "expirado";
  return "valido";
}

/** O estabelecimento abre o QR: mostra só primeiro nome, foto e se a carteirinha vale agora. Nada de CPF ou telefone. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    enforceRateLimit(`club-validate-get:${ip}`, 60, 60_000);
    const { code } = await params;
    const t = await loadToken(code.toUpperCase());
    const status = tokenStatus(t);
    if (!t) return ok({ status });
    const { data: d } = await db.from("drivers").select("full_name, photo_url, active, club_blocked").eq("id", t.driver_id).maybeSingle();
    const eligible = Boolean(d && d.active !== false && !d.club_blocked);
    const parts = String(d?.full_name ?? "").trim().split(/\s+/);
    return ok({
      status: eligible ? status : "inelegivel",
      name: parts.length > 1 ? `${parts[0]} ${parts.at(-1)?.charAt(0)}.` : (parts[0] ?? "Motorista"),
      photo_url: await resolveDriverPhotoDisplayUrl((d?.photo_url as string | null) ?? null),
      number: memberNumber(t.driver_id),
      expires_at: t.expires_at
    });
  } catch (e) {
    return mapApiError(e);
  }
}

const schema = z.object({
  pin: z.string().regex(/^\d{4,6}$/),
  benefit_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional().nullable(),
  purchase: z.number().nonnegative().max(1_000_000).optional().nullable(),
  liters: z.number().nonnegative().max(5_000).optional().nullable(),
  saved: z.number().nonnegative().max(1_000_000).optional().nullable()
});

/**
 * Passo 1 (sem benefit_id): a loja digita o PIN → devolve os benefícios dela.
 * Passo 2 (com benefit_id): registra o uso, calcula a economia e queima o código.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    enforceRateLimit(`club-validate-post:${ip}`, 20, 60_000);
    const { code } = await params;
    const t = await loadToken(code.toUpperCase());
    const status = tokenStatus(t);
    if (!t || status !== "valido") return fail("TOKEN_" + status.toUpperCase(), status === "expirado" ? "Código expirado. Peça ao motorista para abrir a carteirinha de novo." : status === "usado" ? "Este código já foi usado." : status === "bloqueado" ? "Código bloqueado por tentativas de PIN erradas." : "Código inválido.", 400);
    const { data: drv } = await db.from("drivers").select("active, club_blocked").eq("id", t.driver_id).maybeSingle();
    if (!drv || drv.active === false || drv.club_blocked) return fail("NOT_ELIGIBLE", "Motorista sem acesso ao clube no momento.", 403);

    const body = schema.parse(await request.json());
    const { data: partners } = await db
      .from("club_partners")
      .select("id, name, status, publish_at, validation_pin_hash")
      .eq("tenant_id", t.tenant_id)
      .not("validation_pin_hash", "is", null);
    const partner = (partners ?? []).find((p) => partnerIsLive(p as { status: string; publish_at: string | null }) && verifyDriverPin(body.pin, p.validation_pin_hash as string));
    if (!partner) {
      const attempts = t.attempts + 1;
      await db.from("club_tokens").update({ attempts }).eq("id", t.id);
      return fail("BAD_PIN", attempts >= MAX_ATTEMPTS ? "PIN errado. O código foi bloqueado; peça um novo ao motorista." : `PIN do estabelecimento incorreto (${MAX_ATTEMPTS - attempts} tentativa(s) restante(s)).`, 401);
    }

    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const [{ data: benefits }, { data: branches }] = await Promise.all([
      db.from("club_benefits").select("id, title, kind, value, rules, valid_from, valid_until, active, max_uses_per_driver, max_uses_per_month, branch_ids").eq("partner_id", partner.id).eq("active", true),
      db.from("club_branches").select("id, name").eq("partner_id", partner.id).eq("active", true)
    ]);
    const valid = (benefits ?? []).filter((b) => benefitIsValid(b as { active: boolean; valid_from: string | null; valid_until: string | null }, today));

    if (!body.benefit_id) {
      return ok({
        partner: { id: partner.id, name: partner.name },
        benefits: valid.map((b) => ({ id: b.id, title: b.title, kind: b.kind, value: b.value, rules: b.rules, branch_ids: b.branch_ids })),
        branches: branches ?? []
      });
    }

    const benefit = valid.find((b) => b.id === body.benefit_id);
    if (!benefit) return fail("BENEFIT_INVALID", "Benefício indisponível ou fora da validade.", 400);

    // Limites de uso por motorista (total e no mês).
    if (benefit.max_uses_per_driver || benefit.max_uses_per_month) {
      const { data: used } = await db.from("club_redemptions").select("created_at").eq("driver_id", t.driver_id).eq("benefit_id", benefit.id).eq("status", "registrado");
      const all = used ?? [];
      const monthStart = `${today.slice(0, 7)}-01T03:00:00Z`;
      if (benefit.max_uses_per_driver && all.length >= benefit.max_uses_per_driver) return fail("LIMIT", "Este motorista já atingiu o limite de usos deste benefício.", 409);
      if (benefit.max_uses_per_month && all.filter((u) => String(u.created_at) >= monthStart).length >= benefit.max_uses_per_month) return fail("LIMIT_MONTH", "Este motorista já atingiu o limite do mês para este benefício.", 409);
    }

    // Queima o código antes de gravar (evita usar duas vezes ao mesmo tempo).
    const { data: burned } = await db.from("club_tokens").update({ used_at: new Date().toISOString(), partner_id: partner.id, benefit_id: benefit.id }).eq("id", t.id).is("used_at", null).select("id").maybeSingle();
    if (!burned) return fail("TOKEN_USADO", "Este código já foi usado.", 409);

    const saved = savedAmount(benefit.kind as BenefitKind, benefit.value == null ? null : Number(benefit.value), { purchase: body.purchase, liters: body.liters, saved: body.saved });
    const branchOk = body.branch_id && (branches ?? []).some((b) => b.id === body.branch_id) ? body.branch_id : null;
    const { data: red, error } = await db
      .from("club_redemptions")
      .insert({
        tenant_id: t.tenant_id,
        driver_id: t.driver_id,
        partner_id: partner.id,
        benefit_id: benefit.id,
        branch_id: branchOk,
        token_id: t.id,
        purchase_amount: body.purchase ?? null,
        saved_amount: saved,
        source: "qr",
        status: "registrado"
      })
      .select("id, created_at")
      .single();
    if (error) throw error;
    return ok({ registered: true, id: red.id, at: red.created_at, saved, benefit: benefit.title, partner: partner.name });
  } catch (e) {
    return mapApiError(e);
  }
}
