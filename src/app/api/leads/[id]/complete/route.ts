import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { SIGNUP_FILES } from "@/lib/drivers/driver-signup-fields";
import { signupFolder } from "@/lib/leads/signup-token";

const IMG = /\.(jpe?g|png|webp|heic|heif|gif)$/i;

/**
 * Cadastro completo do motorista, com links temporários (1 h) dos documentos. Só a central vê.
 * Se ele ainda não terminou, mostra o que já subiu até agora (parcial).
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: lead } = await db
      .from("site_leads")
      .select("id, tenant_id, complete_data, complete_files, completed_at, draft_data, draft_step, draft_at")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!lead) return fail("NOT_FOUND", "Cadastro não encontrado", 404);

    const files: Record<string, string> = { ...((lead.complete_files ?? {}) as Record<string, string>) };
    let partial = false;
    if (!lead.completed_at) {
      // Ainda preenchendo: pega o último arquivo de cada tipo que ele já subiu.
      const folder = signupFolder(lead as { tenant_id: string; id: string });
      const { data: list } = await db.storage.from("driver-docs").list(folder.replace(/\/$/, ""), { limit: 100, sortBy: { column: "name", order: "asc" } });
      for (const f of list ?? []) {
        const kind = SIGNUP_FILES.find((s) => f.name.startsWith(`${s.kind}-`))?.kind;
        if (kind) {
          files[kind] = folder + f.name;
          partial = true;
        }
      }
    }

    const links = await Promise.all(
      SIGNUP_FILES.filter((f) => files[f.kind]).map(async (f) => ({
        kind: f.kind,
        label: f.label,
        image: IMG.test(files[f.kind]!),
        url: (await db.storage.from("driver-docs").createSignedUrl(files[f.kind]!, 3600)).data?.signedUrl ?? null
      }))
    );
    const missing = SIGNUP_FILES.filter((f) => f.required && !files[f.kind]).map((f) => ({ kind: f.kind, label: f.label }));
    return ok({
      data: lead.complete_data,
      completed_at: lead.completed_at,
      partial,
      files: links,
      missing,
      draft: lead.completed_at ? null : lead.draft_data,
      draft_step: lead.draft_step,
      draft_at: lead.draft_at
    });
  } catch (e) {
    return mapApiError(e);
  }
}
