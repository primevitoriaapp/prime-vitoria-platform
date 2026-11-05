import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

type ArchiveRow = { id: string; file_path: string; file_name: string };

async function load(id: string): Promise<{
  session: Awaited<ReturnType<typeof getSessionContext>>;
  tenantId: string | null;
  row: ArchiveRow | null;
  denied: Response | null;
}> {
  const session = await getSessionContext();
  if (session.role !== "admin" && session.role !== "financeiro") return { session, tenantId: null, row: null, denied: fail("FORBIDDEN", "Sem permissão", 403) };
  const tenantId = assertTenantScope(session);
  const { data } = await db.from("archive_files").select("id, file_path, file_name").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return { session, tenantId, row: (data as ArchiveRow | null) ?? null, denied: data ? null : fail("NOT_FOUND", "Arquivo não encontrado", 404) };
}

/** Baixa o arquivo (link temporário de 5 minutos). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { row, denied } = await load(id);
    if (denied) return denied;
    if (!row) return fail("NOT_FOUND", "Arquivo não encontrado", 404);
    const { data, error } = await db.storage.from("archive-files").createSignedUrl(row.file_path, 300, { download: row.file_name });
    if (error || !data) return fail("DOWNLOAD_FAILED", "Não foi possível abrir o arquivo.", 500);
    return NextResponse.redirect(data.signedUrl);
  } catch (e) {
    return mapApiError(e);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, tenantId, row, denied } = await load(id);
    if (denied) return denied;
    if (!row || !tenantId) return fail("NOT_FOUND", "Arquivo não encontrado", 404);
    if (session.role !== "admin") return fail("FORBIDDEN", "Só o admin apaga arquivos do arquivo", 403);
    if (new URL(request.url).searchParams.get("confirmar") !== "APAGAR") return fail("CONFIRM", "Digite APAGAR para confirmar", 400);
    await db.storage.from("archive-files").remove([row.file_path]);
    await db.from("archive_files").delete().eq("id", id).eq("tenant_id", tenantId);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "archive.delete", entityType: "archive_file", entityId: id, metadata: { arquivo: row.file_name } }).catch(() => undefined);
    return ok({ deleted: true });
  } catch (e) {
    return mapApiError(e);
  }
}
