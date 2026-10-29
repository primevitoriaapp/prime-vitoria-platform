import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { STAFF_ROLES, StaffUserError, createStaffUser } from "@/lib/auth/staff-users";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(40).optional().nullable(),
  role: z.enum(STAFF_ROLES)
});

/** Equipe da Prime (admin, operador, financeiro). */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só o administrador gerencia usuários", 403);
    const tenantId = assertTenantScope(session);
    const { data, error } = await db
      .from("profiles")
      .select("id, name, phone, role, active, created_at")
      .eq("tenant_id", tenantId)
      .in("role", [...STAFF_ROLES])
      .order("name");
    if (error) return fail("LIST_FAILED", error.message, 500);
    const emails = new Map<string, string>();
    for (let page = 1; page <= 10; page += 1) {
      const { data: u } = await db.auth.admin.listUsers({ page, perPage: 200 });
      for (const x of u?.users ?? []) if (x.email) emails.set(x.id, x.email);
      if ((u?.users.length ?? 0) < 200) break;
    }
    return ok((data ?? []).map((p) => ({ ...p, email: emails.get(p.id as string) ?? null, me: p.id === session.userId })));
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só o administrador cria usuários", 403);
    const tenantId = assertTenantScope(session);
    const body = createSchema.parse(await request.json());
    const created = await createStaffUser({ tenantId, ...body });
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "staff_user.create",
      entityType: "profile",
      entityId: created.id,
      metadata: { email: created.email, role: body.role },
      request
    });
    return ok(created, 201);
  } catch (error) {
    if (error instanceof StaffUserError) return fail(error.code, error.message, error.status);
    return mapApiError(error);
  }
}
