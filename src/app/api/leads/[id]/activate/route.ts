import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { zapsignListTemplates } from "@/lib/integrations/zapsign";
import { activateLead, ActivateError } from "@/lib/leads/activate-lead";

const STAFF = ["admin", "operador"];
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** O que a central precisa para ativar: categorias, modelos de contrato e quem assina pela Prime. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: lead } = await db.from("site_leads").select("complete_data").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!lead) return fail("NOT_FOUND", "Cadastro não encontrado", 404);
    const c = (lead.complete_data ?? {}) as Record<string, unknown>;

    const { data: cats } = await db.from("vehicle_categories").select("id, name").eq("tenant_id", tenantId).order("name");
    const templates = await zapsignListTemplates().catch(() => []);
    const bond = String(c.bond ?? "");
    const drv = templates.filter((t) => /motorista/i.test(t.name));
    const suggested = (bond === "pj" || bond === "mei" ? drv.find((t) => /\bPJ\b|jur[ií]dica|cnpj|mei/i.test(t.name)) : drv.find((t) => /\bPF\b|f[ií]sica|aut[oô]nomo/i.test(t.name))) ?? drv[0] ?? null;

    // Assinantes da Prime: os mesmos do último contrato de motorista (sem o motorista e sem marcadores).
    const { data: last } = await db.from("contracts").select("signers, driver_id").eq("tenant_id", tenantId).not("driver_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const seen = new Set<string>();
    const prime = ((last?.signers ?? []) as { name?: string; email?: string | null; role?: string }[])
      .slice(1)
      .filter((x) => x.name && x.email && !/motorista@motorista|exemplo|teste/i.test(String(x.email)) && !/TESTEMUNHA DO MOTORISTA/i.test(String(x.name)))
      .filter((x) => (seen.has(String(x.email)) ? false : (seen.add(String(x.email)), true)))
      .map((x) => ({ name: String(x.name), email: String(x.email), role: x.role ?? "" }));
    const witness =
      c.witness_ok === "sim" && c.emergency_name
        ? { name: String(c.emergency_name), email: String(c.emergency_email ?? ""), phone: String(c.emergency_phone ?? ""), role: "Testemunha" }
        : null;

    const { data: same } = await db.from("drivers").select("full_name, cpf").eq("tenant_id", tenantId);
    const dup = (same ?? []).find((d) => digits(d.cpf) === digits(c.cpf) && digits(c.cpf).length === 11);

    return ok({ categories: cats ?? [], templates, suggested_template: suggested?.token ?? null, prime_signers: prime, witness, duplicate: dup ? String(dup.full_name ?? "") : null });
  } catch (e) {
    return mapApiError(e);
  }
}

const schema = z.object({
  category_ids: z.array(z.string().uuid()).max(10).default([]),
  template_id: z.string().max(100).nullable().optional(),
  signers: z.array(z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().nullable().optional().or(z.literal("")), phone: z.string().max(30).nullable().optional(), role: z.string().max(40).optional() })).max(5).default([])
});

/** Ativa: cria motorista, veículo, documentos, PIN e contrato. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = schema.parse(await request.json().catch(() => ({})));
    const r = await activateLead({ tenantId, userId: session.userId, leadId: id, categoryIds: b.category_ids, templateId: b.template_id ?? null, signers: b.signers.map((x) => ({ ...x, email: x.email || null })) });
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "driver.activate_from_site", entityType: "driver", entityId: r.driverId, metadata: { lead_id: id, contract: r.contract.status, docs: r.docs }, request });
    return ok(r);
  } catch (e) {
    if (e instanceof ActivateError) return fail(e.code, e.message, 409);
    return mapApiError(e);
  }
}
