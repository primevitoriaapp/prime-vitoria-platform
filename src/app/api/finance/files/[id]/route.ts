import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

type FileRow = { id: string; file_path: string; file_name: string };

async function load(id: string): Promise<{ tenantId: string | null; row: FileRow | null; denied: Response | null }> {
  const session = await getSessionContext();
  if (session.role !== "admin" && session.role !== "financeiro") return { tenantId: null, row: null, denied: fail("FORBIDDEN", "Sem permissão", 403) };
  const tenantId = assertTenantScope(session);
  const { data } = await db.from("finance_files").select("id, file_path, file_name").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return { tenantId, row: (data as FileRow | null) ?? null, denied: data ? null : fail("NOT_FOUND", "Anexo não encontrado", 404) };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { row, denied } = await load(id);
    if (denied) return denied;
    if (!row) return fail("NOT_FOUND", "Anexo não encontrado", 404);
    const { data, error } = await db.storage.from("archive-files").createSignedUrl(row.file_path, 300);
    if (error || !data) return fail("DOWNLOAD_FAILED", "Não foi possível abrir o anexo.", 500);
    return NextResponse.redirect(data.signedUrl);
  } catch (e) {
    return mapApiError(e);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { tenantId, row, denied } = await load(id);
    if (denied) return denied;
    if (!row || !tenantId) return fail("NOT_FOUND", "Anexo não encontrado", 404);
    await db.storage.from("archive-files").remove([row.file_path]);
    await db.from("finance_files").delete().eq("id", id).eq("tenant_id", tenantId);
    return ok({ deleted: true });
  } catch (e) {
    return mapApiError(e);
  }
}
