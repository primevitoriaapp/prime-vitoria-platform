import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { syncPending, partySignUrl, type ContractRow } from "@/lib/contracts/contracts";
import { mapZapStatus, zapsignAddSigner, zapsignCreateDoc, zapsignCreateFromTemplate, zapsignGetDoc, zapTokenFromLink } from "@/lib/integrations/zapsign";
import { pushToDriver } from "@/lib/push/web-push";

const STAFF = ["admin", "operador", "financeiro"];

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const u = new URL(request.url);
    const driverId = u.searchParams.get("driver_id");
    const clientId = u.searchParams.get("client_id");
    let q = db.from("contracts").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    if (driverId) q = q.eq("driver_id", driverId);
    else if (clientId) q = q.eq("client_id", clientId);
    else return fail("VALIDATION_ERROR", "Informe o motorista ou o cliente.", 400);
    const { data, error } = await q;
    if (error) return fail("LIST_FAILED", error.message, 500);
    return ok(await syncPending((data ?? []) as ContractRow[]));
  } catch (e) {
    return mapApiError(e);
  }
}

const signer = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().optional().nullable().or(z.literal("")), phone: z.string().trim().max(30).optional().nullable(), role: z.string().max(40).optional() });
const schema = z.object({
  driver_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(3).max(200),
  mode: z.enum(["zapsign", "modelo", "link", "arquivo"]),
  template_id: z.string().max(100).optional().nullable(),
  fields: z.array(z.object({ variable: z.string().max(120), value: z.string().max(2000) })).max(200).optional(),
  file_path: z.string().max(300).optional().nullable(),
  link: z.string().trim().max(500).optional().nullable(),
  signers: z.array(signer).max(6).optional(),
  notes: z.string().max(500).optional().nullable()
});

/**
 * Novo contrato:
 *  - zapsign: manda o PDF para a ZapSign e cria os links de assinatura;
 *  - link: liga um documento que já está na ZapSign (cola o link);
 *  - arquivo: só guarda o PDF já assinado.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const b = schema.parse(await request.json());
    if (Boolean(b.driver_id) === Boolean(b.client_id)) return fail("VALIDATION_ERROR", "Contrato é de um motorista OU de um cliente.", 400);

    const base = { tenant_id: tenantId, driver_id: b.driver_id ?? null, client_id: b.client_id ?? null, title: b.title, notes: b.notes ?? null, created_by: session.userId, file_path: b.file_path ?? null };
    let row: Record<string, unknown>;

    if (b.mode === "arquivo") {
      if (!b.file_path) return fail("FILE_REQUIRED", "Anexe o PDF do contrato.", 400);
      row = { ...base, status: "assinado", signed_at: new Date().toISOString() };
    } else if (b.mode === "link") {
      const token = zapTokenFromLink(b.link ?? "");
      if (!token) return fail("LINK_INVALID", "Não achei o código do documento nesse link da ZapSign.", 400);
      const doc = await zapsignGetDoc(token);
      const signers = (doc.signers ?? []).map((s) => ({ name: s.name, email: s.email ?? null, status: s.status, sign_url: s.sign_url ?? null, signed_at: s.signed_at ?? null }));
      const status = mapZapStatus(doc.status);
      row = { ...base, zapsign_token: token, signers, status, sign_url: partySignUrl(signers, null), synced_at: new Date().toISOString(), signed_at: status === "assinado" ? new Date().toISOString() : null };
    } else if (b.mode === "modelo") {
      if (!b.template_id) return fail("TEMPLATE_REQUIRED", "Escolha o modelo da ZapSign.", 400);
      if (!b.signers?.length) return fail("SIGNERS_REQUIRED", "Informe quem assina.", 400);
      const [first, ...others] = b.signers;
      const doc = await zapsignCreateFromTemplate({
        templateId: b.template_id,
        signer: { ...first, email: first.email || null },
        data: (b.fields ?? []).filter((f) => f.value.trim()).map((f) => ({ de: f.variable, para: f.value }))
      });
      const signers: { name: string; email: string | null; status?: string; sign_url: string | null; signed_at: null; role?: string }[] = (doc.signers ?? []).map((s) => ({ name: s.name, email: s.email ?? null, status: s.status, sign_url: s.sign_url ?? null, signed_at: null, role: first.role }));
      for (const o of others) {
        try {
          const added = await zapsignAddSigner(doc.token, { ...o, email: o.email || null });
          signers.push({ name: added.name ?? o.name, email: added.email ?? o.email ?? null, status: added.status ?? "new", sign_url: added.sign_url ?? null, signed_at: null, role: o.role });
        } catch {
          signers.push({ name: o.name, email: o.email ?? null, status: "erro", sign_url: null, signed_at: null, role: o.role });
        }
      }
      row = { ...base, title: b.title || doc.name, zapsign_token: doc.token, signers, status: "pendente", sign_url: partySignUrl(signers, first.name), synced_at: new Date().toISOString() };
    } else {
      if (!b.file_path) return fail("FILE_REQUIRED", "Anexe o PDF do contrato.", 400);
      if (!b.signers?.length) return fail("SIGNERS_REQUIRED", "Informe quem assina.", 400);
      const { data: blob, error: dlErr } = await db.storage.from("contracts").download(b.file_path);
      if (dlErr || !blob) return fail("FILE_NOT_FOUND", "O PDF não chegou. Anexe de novo.", 400);
      const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
      const doc = await zapsignCreateDoc({ name: b.title, base64Pdf: base64, signers: b.signers.map((s) => ({ ...s, email: s.email || null })) });
      const signers = (doc.signers ?? []).map((s, i) => ({ name: s.name, email: s.email ?? null, status: s.status, sign_url: s.sign_url ?? null, signed_at: null, role: b.signers?.[i]?.role }));
      row = { ...base, zapsign_token: doc.token, signers, status: "pendente", sign_url: partySignUrl(signers, b.signers[0].name), synced_at: new Date().toISOString() };
    }

    const { data, error } = await db.from("contracts").insert(row).select("*").single();
    if (error) return fail("SAVE_FAILED", error.message, 500);
    if (b.driver_id && data.status === "pendente") {
      await pushToDriver(tenantId, b.driver_id, { title: "✍️ Contrato para assinar", body: `${b.title} · toque para abrir e assinar`, url: "/driver?aba=perfil", tag: `contrato-${data.id}` }).catch(() => 0);
    }
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "contract.create", entityType: "contract", entityId: data.id as string, metadata: { mode: b.mode, driver_id: b.driver_id ?? null, client_id: b.client_id ?? null }, request });
    return ok(data);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("ZapSign")) return fail("ZAPSIGN_ERROR", e.message, 502);
    return mapApiError(e);
  }
}
