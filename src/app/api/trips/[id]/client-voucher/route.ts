import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

const BUCKET = "invoice-files";
const MAX_BYTES = 10 * 1024 * 1024;
const MIME: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

function staff(role: string) {
  return role === "admin" || role === "financeiro" || role === "operador";
}

/** Guarda o voucher do cliente (ex.: PDF da CEP) na corrida, para ir junto na fatura. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: t } = await db.from("trips").select("id, client_invoice_id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!t) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("NO_FILE", "Escolha o arquivo", 400);
    if (file.size > MAX_BYTES) return fail("FILE_TOO_BIG", "Arquivo maior que 10 MB", 400);
    const ext = MIME[file.type];
    if (!ext) return fail("INVALID_TYPE", "Envie PDF, PNG ou JPG", 400);
    const path = `${tenantId}/trips/${id}/voucher-${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
    if (upErr) return fail("UPLOAD_FAILED", upErr.message, 500);
    await db.from("trips").update({ client_voucher_path: path }).eq("id", id).eq("tenant_id", tenantId);
    if (t.client_invoice_id) await db.from("client_invoices").update({ voucher_path: path }).eq("id", t.client_invoice_id).is("voucher_path", null);
    return ok({ uploaded: true });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: t } = await db.from("trips").select("client_voucher_path").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!t?.client_voucher_path) return fail("NO_FILE", "Sem voucher guardado", 404);
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(t.client_voucher_path as string, 300);
    if (error || !data?.signedUrl) return fail("SIGN_FAILED", "Não foi possível abrir", 500);
    return NextResponse.redirect(data.signedUrl);
  } catch (error) {
    return mapApiError(error);
  }
}
