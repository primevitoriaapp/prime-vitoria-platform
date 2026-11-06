import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { getClientInvoice } from "@/lib/finance/client-invoices";
import { insertAuditEvent } from "@/lib/server/audit-log";

const BUCKET = "invoice-files";
const MAX_BYTES = 10 * 1024 * 1024;
const KINDS = { boleto: "boleto_path", nf: "nf_path", voucher: "voucher_path" } as const;
type Kind = keyof typeof KINDS;
const MIME: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

function extrasOf(inv: Record<string, unknown>): string[] {
  return Array.isArray(inv.nf_extra_paths) ? (inv.nf_extra_paths as string[]).filter(Boolean) : [];
}

function kindOf(v: string | null): Kind | null {
  return v === "boleto" || v === "nf" || v === "voucher" ? v : null;
}

/** Equipe anexa o PDF do boleto (gerado no banco) ou da nota fiscal na fatura. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Só admin ou financeiro anexam arquivos", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const invoice = await getClientInvoice(tenantId, id);
    if (!invoice) return fail("INVOICE_NOT_FOUND", "Fatura não encontrada", 404);

    const form = await request.formData();
    const rawKind = String(form.get("kind") ?? "");
    // "nf_extra" = mais uma nota fiscal na mesma fatura (ex.: 50% adiantado + 50% no final).
    const extra = rawKind === "nf_extra";
    const kind = extra ? "nf" : kindOf(rawKind);
    const file = form.get("file");
    if (!kind) return fail("INVALID_KIND", "Tipo de arquivo inválido", 400);
    if (!(file instanceof File) || file.size === 0) return fail("NO_FILE", "Escolha o arquivo", 400);
    if (file.size > MAX_BYTES) return fail("FILE_TOO_BIG", "Arquivo maior que 10 MB", 400);
    const ext = MIME[file.type];
    if (!ext) return fail("INVALID_TYPE", "Envie PDF, PNG ou JPG", 400);

    const path = `${tenantId}/${id}/${extra ? "nfx" : kind}-${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
    if (upErr) return fail("UPLOAD_FAILED", upErr.message, 500);

    if (extra || (kind === "nf" && (invoice as Record<string, unknown>).nf_path && form.get("append") === "1")) {
      const list = [...extrasOf(invoice as Record<string, unknown>), path];
      const { error } = await db.from("client_invoices").update({ nf_extra_paths: list }).eq("id", id).eq("tenant_id", tenantId);
      if (error) return fail("SAVE_FAILED", error.message, 500);
      await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "invoice.nf_upload", entityType: "client_invoice", entityId: id, metadata: { file: file.name, extra: list.length + 1 }, request });
      return ok({ kind: "nf", uploaded: true, count: list.length + 1 });
    }
    // Primeira nota ainda vazia: entra como a nota principal.
    const old = (invoice as Record<string, unknown>)[KINDS[kind]] as string | null;
    const { error } = await db.from("client_invoices").update({ [KINDS[kind]]: path }).eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("SAVE_FAILED", error.message, 500);
    if (old && old !== path) await db.storage.from(BUCKET).remove([old]);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: kind === "boleto" ? "invoice.boleto_upload" : kind === "nf" ? "invoice.nf_upload" : "invoice.voucher_upload",
      entityType: "client_invoice",
      entityId: id,
      metadata: { file: file.name },
      request
    });
    return ok({ kind, uploaded: true });
  } catch (error) {
    return mapApiError(error);
  }
}

/** Abre o arquivo: equipe Prime ou o gestor da empresa dona da fatura. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const kind = kindOf(new URL(request.url).searchParams.get("kind"));
    if (!kind) return fail("INVALID_KIND", "Tipo de arquivo inválido", 400);
    const invoice = (await getClientInvoice(tenantId, id)) as Record<string, unknown> | null;
    if (!invoice) return fail("INVOICE_NOT_FOUND", "Fatura não encontrada", 404);

    const staff = session.role === "admin" || session.role === "financeiro" || session.role === "operador";
    const gestor = session.role === "cliente" && session.clientId === invoice.client_id && session.clientAccess !== "solicitante";
    if (!staff && !gestor) return fail("FORBIDDEN", "Sem acesso a esta fatura", 403);

    const idx = Number(new URL(request.url).searchParams.get("i") ?? "0");
    const path = kind === "nf" && idx > 0 ? (extrasOf(invoice)[idx - 1] ?? null) : (invoice[KINDS[kind]] as string | null);
    if (!path) return fail("NO_FILE", "Arquivo ainda não anexado", 404);
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return fail("SIGN_FAILED", "Não foi possível abrir o arquivo", 500);
    return NextResponse.redirect(data.signedUrl);
  } catch (error) {
    return mapApiError(error);
  }
}

/** Remove uma nota fiscal extra (?i=1 é a 2ª nota, ?i=2 a 3ª…). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Só admin ou financeiro removem arquivos", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const invoice = (await getClientInvoice(tenantId, id)) as Record<string, unknown> | null;
    if (!invoice) return fail("INVOICE_NOT_FOUND", "Fatura não encontrada", 404);
    const idx = Number(new URL(request.url).searchParams.get("i") ?? "0");
    const list = extrasOf(invoice);
    if (!(idx >= 1 && idx <= list.length)) return fail("NO_FILE", "Nota não encontrada", 404);
    const [removed] = list.splice(idx - 1, 1);
    const { error } = await db.from("client_invoices").update({ nf_extra_paths: list }).eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("SAVE_FAILED", error.message, 500);
    if (removed) await db.storage.from(BUCKET).remove([removed]);
    return ok({ removed: true });
  } catch (error) {
    return mapApiError(error);
  }
}
