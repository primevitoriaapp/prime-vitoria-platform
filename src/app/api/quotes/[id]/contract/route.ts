import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { zapsignCreateFromTemplate, zapsignListTemplates, zapsignTemplateVariables, zapsignToken } from "@/lib/integrations/zapsign";
import { partySignUrl, syncPending, type ContractRow } from "@/lib/contracts/contracts";
import { CLIENT_CONTRACT_TEMPLATE_NAME, maybeAutoApproveQuote, quoteContractValues } from "@/lib/contracts/quote-contract";

const STAFF = ["admin", "operador", "financeiro"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

async function guard() {
  const session = await getSessionContext();
  if (!STAFF.includes(session.role)) return { session, denied: fail("FORBIDDEN", "Sem permissão", 403) };
  return { session, denied: null };
}

/**
 * Contrato do orçamento: modelos da ZapSign, o modelo sugerido, os campos já preenchidos
 * com os dados do orçamento e o contrato que já existe (com a situação atualizada).
 * ?template=<token> troca o modelo e devolve as variáveis dele preenchidas.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, denied } = await guard();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: rows } = await db.from("contracts").select("*").eq("tenant_id", tenantId).eq("quote_id", id).order("created_at", { ascending: false });
    let contracts = (rows ?? []) as ContractRow[];
    if (contracts.some((c) => c.status === "pendente")) {
      contracts = await syncPending(contracts);
      if (contracts.some((c) => c.status === "assinado")) await maybeAutoApproveQuote(tenantId, id).catch(() => null);
    }
    const connected = Boolean(await zapsignToken());
    if (!connected) return ok({ connected, contracts, templates: [], template: null, fields: [], signer: null });
    const templates = await zapsignListTemplates().catch(() => []);
    const wanted = new URL(request.url).searchParams.get("template");
    const tpl = templates.find((t) => t.token === wanted) ?? templates.find((t) => norm(t.name) === norm(CLIENT_CONTRACT_TEMPLATE_NAME)) ?? null;
    const base = await quoteContractValues(tenantId, id);
    let fields: { variable: string; value: string }[] = [];
    if (tpl) {
      const { variables } = await zapsignTemplateVariables(tpl.token);
      fields = variables.map((v) => ({ variable: v, value: base.values[v.replace(/[{}\s]/g, "")] ?? "" }));
    }
    const { data: q } = await db.from("quotes").select("status").eq("id", id).maybeSingle();
    return ok({ connected, contracts, templates, template: tpl, fields, signer: base.signer, quote_status: q?.status ?? null });
  } catch (e) {
    return mapApiError(e);
  }
}

const bodySchema = z.object({
  template_id: z.string().min(5).max(100),
  fields: z.array(z.object({ variable: z.string().max(120), value: z.string().max(3000) })).max(300),
  signer: z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().max(200).nullable().optional(), phone: z.string().trim().max(30).nullable().optional() })
});

/** Gera o contrato na ZapSign com os dados conferidos e devolve o link de assinatura do cliente. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, denied } = await guard();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = bodySchema.parse(await request.json());
    if (!b.signer.email && !b.signer.phone) return fail("SIGNER_CONTACT", "Informe o e-mail ou o WhatsApp de quem assina.", 400);
    const base = await quoteContractValues(tenantId, id);
    const doc = await zapsignCreateFromTemplate({
      templateId: b.template_id,
      signer: { name: b.signer.name, email: b.signer.email || null, phone: b.signer.phone || null },
      data: b.fields.filter((f) => f.value.trim()).map((f) => ({ de: f.variable, para: f.value })),
      externalId: `quote:${id}`
    });
    const signers = (doc.signers ?? []).map((s) => ({ name: s.name, email: s.email ?? null, status: s.status, sign_url: s.sign_url ?? null, signed_at: null }));
    const { data: row, error } = await db
      .from("contracts")
      .insert({
        tenant_id: tenantId,
        quote_id: id,
        client_id: base.clientId,
        title: `${doc.name || "Contrato"} · ${base.number}`,
        status: "pendente",
        zapsign_token: doc.token,
        signers,
        sign_url: partySignUrl(signers, b.signer.name),
        synced_at: new Date().toISOString(),
        created_by: session.userId
      })
      .select("*")
      .single();
    if (error) return fail("SAVE_FAILED", `O contrato foi criado na ZapSign, mas não foi salvo aqui: ${error.message}`, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "quote.contract_create", entityType: "quote", entityId: id, metadata: { contract_id: row.id }, request });
    return ok(row);
  } catch (e) {
    return mapApiError(e);
  }
}
