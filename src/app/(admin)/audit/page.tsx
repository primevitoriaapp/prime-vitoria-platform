import Link from "next/link";
import type { Route } from "next";
import { can } from "@/lib/security/rbac";
import { fetchInternalApi } from "@/lib/server/internal-fetch";
import { getSessionContext } from "@/lib/server/session";
import { AUDIT_ENTITY_LABEL, ROLE_LABEL, auditActionLabel } from "@/lib/audit/audit-labels";

type AuditItem = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  ip: string | null;
};

export default async function AuditPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; entity_type?: string; action?: string; actor?: string; group?: string }>;
}) {
  const session = await getSessionContext();
  const params = await searchParams;

  if (!can(session, "trip.read")) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16">
        <p className="text-slate-700">Sem permissão para consultar auditoria.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-amber-700 underline">
          Voltar ao painel
        </Link>
      </main>
    );
  }

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 40));
  // "quem" junta pessoa e grupo num só filtro: "" | "equipe" | "motoristas" | "sistema" | <id>
  const who = params.actor?.trim() || params.group?.trim() || "";
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (params.entity_type?.trim()) qs.set("entity_type", params.entity_type.trim());
  if (params.action?.trim()) qs.set("action", params.action.trim());
  if (["equipe", "motoristas", "sistema"].includes(who)) qs.set("group", who);
  else if (who) qs.set("actor", who);

  const res = await fetchInternalApi(`/api/audit-events?${qs.toString()}`);
  const payload = res.ok
    ? ((await res.json()) as {
        success?: boolean;
        data?: {
          items: AuditItem[];
          total: number;
          actors?: Record<string, { name: string; role: string }>;
          people?: Array<{ id: string; name: string; role: string }>;
        };
      })
    : null;
  const items = payload?.success ? (payload.data?.items ?? []) : [];
  const total = payload?.success ? (payload.data?.total ?? 0) : 0;
  const actors = payload?.data?.actors ?? {};
  const people = (payload?.data?.people ?? []).filter((p) => !/staging/i.test(p.name));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const linkQs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (params.entity_type?.trim()) linkQs.set("entity_type", params.entity_type.trim());
  if (params.action?.trim()) linkQs.set("action", params.action.trim());
  if (who) linkQs.set("actor", who);
  const linkBase = (overrides: Record<string, string | undefined>) => {
    const n = new URLSearchParams(linkQs);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") n.delete(k);
      else n.set(k, v);
    }
    return `/audit?${n.toString()}`;
  };

  const whoLabel = (row: AuditItem) => {
    if (!row.actor_user_id) return { name: "Sistema (automático)", role: "" };
    const a = actors[row.actor_user_id];
    return { name: a?.name || "Usuário desconhecido", role: a?.role ? (ROLE_LABEL[a.role] ?? a.role) : "" };
  };
  const entityHref = (row: AuditItem): string | null => {
    if (!row.entity_id) return null;
    if (row.entity_type === "trip") return `/agenda?trip=${row.entity_id}#trip-detail`;
    return null;
  };
  const detail = (row: AuditItem): string => {
    const m = row.metadata ?? {};
    const bits: string[] = [];
    for (const k of ["client_ref", "ref", "status", "to", "reason", "passenger_name", "invoice_number"]) {
      const v = (m as Record<string, unknown>)[k];
      if (typeof v === "string" || typeof v === "number") bits.push(String(v));
    }
    return bits.slice(0, 3).join(" · ");
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Auditoria</h1>
          <p className="mt-1 text-sm text-slate-600">Quem fez o quê, e quando. Cada pessoa da equipe aparece com o próprio nome.</p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-amber-700 hover:underline">
          Painel
        </Link>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <input type="hidden" name="page" value="1" />
        <label className="text-sm">
          <span className="block text-slate-600">Quem fez</span>
          <select name="actor" defaultValue={who} className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-slate-900">
            <option value="">Todos</option>
            <option value="equipe">Equipe (painel)</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {"  "}↳ {p.name} ({ROLE_LABEL[p.role] ?? p.role})
              </option>
            ))}
            <option value="motoristas">Motoristas (app)</option>
            <option value="sistema">Sistema (automático)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Tipo</span>
          <select name="entity_type" defaultValue={params.entity_type ?? ""} className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-slate-900">
            <option value="">Todos</option>
            {Object.entries(AUDIT_ENTITY_LABEL)
              .filter(([k]) => k !== "client_invoice")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Por página</span>
          <select name="pageSize" defaultValue={String(pageSize)} className="mt-1 rounded border border-slate-300 px-2 py-1.5">
            <option value="20">20</option>
            <option value="40">40</option>
            <option value="80">80</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-[#fff] hover:bg-slate-800">
          Filtrar
        </button>
        {params.action ? (
          <Link href={linkBase({ action: undefined, page: "1" }) as Route} className="text-xs text-amber-700 underline">
            Tirar filtro “{auditActionLabel(params.action)}”
          </Link>
        ) : null}
      </form>

      {!res.ok || !payload?.success ? (
        <p className="text-sm text-red-700">Não foi possível carregar a lista de auditoria.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {items.length === 0 ? <li className="px-4 py-6 text-sm text-slate-500">Nenhum registro com esse filtro.</li> : null}
            {items.map((row) => {
              const w = whoLabel(row);
              const href = entityHref(row);
              const extra = detail(row);
              return (
                <li key={row.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-start sm:gap-4">
                  <span className="shrink-0 font-mono text-xs text-slate-500 sm:w-36 sm:pt-0.5">
                    {new Date(row.created_at).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "America/Sao_Paulo"
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="text-slate-900">{w.name}</b>
                    {w.role ? <span className="ml-1 text-xs text-slate-500">({w.role})</span> : null}
                    <span className="text-slate-700"> — </span>
                    <Link href={linkBase({ action: row.action, page: "1" }) as Route} className="text-amber-800 hover:underline">
                      {auditActionLabel(row.action)}
                    </Link>
                    {extra ? <span className="ml-1 text-xs text-slate-500">· {extra}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {href ? (
                      <Link href={href as Route} className="text-amber-700 underline">
                        Abrir {AUDIT_ENTITY_LABEL[row.entity_type]?.toLowerCase() ?? "item"}
                      </Link>
                    ) : (
                      AUDIT_ENTITY_LABEL[row.entity_type] ?? row.entity_type
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>
              Página {page} de {totalPages} · {total} registros
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={linkBase({ page: String(page - 1) }) as Route} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50">
                  Anterior
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link href={linkBase({ page: String(page + 1) }) as Route} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50">
                  Seguinte
                </Link>
              ) : null}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
