import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { SIGNUP_FILES } from "@/lib/drivers/driver-signup-fields";

/** Cadastro completo enviado pelo motorista, com links temporários (15 min) dos documentos. Só a central vê. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: lead } = await db.from("site_leads").select("complete_data, complete_files, completed_at").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!lead) return fail("NOT_FOUND", "Cadastro não encontrado", 404);
    const files = (lead.complete_files ?? {}) as Record<string, string>;
    const links = await Promise.all(
      SIGNUP_FILES.filter((f) => files[f.kind]).map(async (f) => ({
        kind: f.kind,
        label: f.label,
        url: (await db.storage.from("driver-docs").createSignedUrl(files[f.kind]!, 900)).data?.signedUrl ?? null
      }))
    );
    return ok({ data: lead.complete_data, completed_at: lead.completed_at, files: links });
  } catch (e) {
    return mapApiError(e);
  }
}
