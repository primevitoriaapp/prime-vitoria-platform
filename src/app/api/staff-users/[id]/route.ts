import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { STAFF_ROLES, temporaryPassword } from "@/lib/auth/staff-users";

const patchSchema = z.object({
  role: z.enum(STAFF_ROLES).optional(),
  active: z.boolean().optional(),
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  reset_password: z.boolean().optional()
});

/** Muda papel, desativa/reativa ou gera nova senha provisória de alguém da equipe. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só o administrador altera usuários", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    const { data: prof } = await db.from("profiles").select("id, role, tenant_id").eq("id", id).maybeSingle();
    if (!prof || prof.tenant_id !== tenantId || !STAFF_ROLES.includes(prof.role as (typeof STAFF_ROLES)[number])) {
      return fail("NOT_FOUND", "Usuário não encontrado", 404);
    }
    if (id === session.userId && (body.active === false || (body.role && body.role !== "admin"))) {
      return fail("SELF_LOCKOUT", "Você não pode tirar o seu próprio acesso de administrador.", 409);
    }

    const update: Record<string, unknown> = {};
    if (body.role) update.role = body.role;
    if (body.active !== undefined) update.active = body.active;
    if (body.name) update.name = body.name;
    if (body.phone !== undefined) update.phone = body.phone || null;
    if (Object.keys(update).length) {
      const { error } = await db.from("profiles").update(update).eq("id", id);
      if (error) return fail("UPDATE_FAILED", error.message, 500);
    }

    let password: string | null = null;
    const authPatch: Record<string, unknown> = {};
    if (body.role) authPatch.app_metadata = { role: body.role };
    if (body.active === false) authPatch.ban_duration = "876000h";
    if (body.active === true) authPatch.ban_duration = "none";
    if (body.reset_password) {
      password = temporaryPassword();
      authPatch.password = password;
    }
    if (Object.keys(authPatch).length) {
      const { error } = await db.auth.admin.updateUserById(id, authPatch);
      if (error) return fail("AUTH_FAILED", error.message, 502);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "staff_user.update",
      entityType: "profile",
      entityId: id,
      metadata: { ...update, reset_password: Boolean(body.reset_password) },
      request
    });
    return ok({ id, password });
  } catch (error) {
    return mapApiError(error);
  }
}
