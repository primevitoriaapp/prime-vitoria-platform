import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { canListAuditEvents } from "@/lib/security/audit-list-access";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  entity_type: z.string().trim().min(1).max(120).optional(),
  action: z.string().trim().min(1).max(120).optional(),
  /** id da pessoa, "sistema" (automático) ou "equipe" (admin/operador/financeiro). */
  actor: z.string().trim().min(1).max(64).optional(),
  group: z.enum(["equipe", "motoristas", "sistema"]).optional()
});

/** Lista eventos de auditoria do tenant (admin, operador ou financeiro). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!canListAuditEvents(session.role)) {
      return fail("FORBIDDEN", "Auditoria reservada a admin, operador e financeiro", 403);
    }
    const tenantId = assertTenantScope(session);
    const filters = listSchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;

    let query = db
      .from("audit_events")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (filters.entity_type) {
      query = query.eq("entity_type", filters.entity_type);
    }
    if (filters.action) {
      query = query.eq("action", filters.action);
    }

    // Pessoas da equipe (para o filtro e para mostrar o nome de quem fez).
    const { data: staffRows } = await db
      .from("profiles")
      .select("id, name, role")
      .eq("tenant_id", tenantId)
      .in("role", ["admin", "operador", "financeiro"]);
    const staff = (staffRows ?? []) as Array<{ id: string; name: string | null; role: string }>;
    const staffIds = staff.map((p) => p.id);

    if (filters.actor === "sistema" || filters.group === "sistema") {
      query = query.is("actor_user_id", null);
    } else if (filters.actor && /^[0-9a-f-]{36}$/i.test(filters.actor)) {
      query = query.eq("actor_user_id", filters.actor);
    } else if (filters.group === "equipe") {
      query = staffIds.length ? query.in("actor_user_id", staffIds) : query.eq("actor_user_id", "00000000-0000-0000-0000-000000000000");
    } else if (filters.group === "motoristas") {
      const { data: drv } = await db.from("profiles").select("id").eq("tenant_id", tenantId).eq("role", "motorista");
      const ids = ((drv ?? []) as Array<{ id: string }>).map((d) => d.id);
      query = ids.length ? query.in("actor_user_id", ids) : query.eq("actor_user_id", "00000000-0000-0000-0000-000000000000");
    }

    const { data, error, count } = await query.range(from, to);

    if (error) return fail("AUDIT_LIST_FAILED", error.message, 500);

    const rows = (data ?? []) as Array<{ actor_user_id: string | null }>;
    const ids = [...new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => Boolean(v)))];
    const actors: Record<string, { name: string; role: string; email?: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await db.from("profiles").select("id, name, role").in("id", ids);
      for (const p of (profs ?? []) as Array<{ id: string; name: string | null; role: string }>) {
        actors[p.id] = { name: p.name?.trim() || "", role: p.role };
      }
      await Promise.all(
        ids.map(async (id) => {
          if (actors[id]?.name) return;
          const { data: u } = await db.auth.admin.getUserById(id).catch(() => ({ data: null }));
          const meta = (u?.user?.user_metadata ?? {}) as { full_name?: string };
          actors[id] = {
            name: meta.full_name?.trim() || u?.user?.email || "Usuário removido",
            role: actors[id]?.role ?? "",
            email: u?.user?.email ?? null
          };
        })
      );
    }

    const people = await Promise.all(
      staff.map(async (p) => {
        let name = p.name?.trim() || "";
        if (!name) {
          const { data: u } = await db.auth.admin.getUserById(p.id).catch(() => ({ data: null }));
          name = (u?.user?.user_metadata as { full_name?: string } | undefined)?.full_name || u?.user?.email || p.id;
        }
        return { id: p.id, name, role: p.role };
      })
    );

    return ok({
      actors,
      people,
      items: data ?? [],
      page: filters.page,
      pageSize: filters.pageSize,
      total: count ?? 0
    });
  } catch (error) {
    return mapApiError(error);
  }
}
