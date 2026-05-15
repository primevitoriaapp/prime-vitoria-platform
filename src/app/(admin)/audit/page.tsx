import Link from "next/link";
import type { Route } from "next";
import { can } from "@/lib/security/rbac";
import { fetchInternalApi } from "@/lib/server/internal-fetch";
import { getSessionContext } from "@/lib/server/session";

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
  searchParams: Promise<{ page?: string; pageSize?: string; entity_type?: string; action?: string }>;
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
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (params.entity_type?.trim()) qs.set("entity_type", params.entity_type.trim());
  if (params.action?.trim()) qs.set("action", params.action.trim());

  const res = await fetchInternalApi(`/api/audit-events?${qs.toString()}`);
  const payload = res.ok ? ((await res.json()) as { success?: boolean; data?: { items: AuditItem[]; total: number } }) : null;
  const items = payload?.success ? (payload.data?.items ?? []) : [];
  const total = payload?.success ? (payload.data?.total ?? 0) : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const linkBase = (overrides: Record<string, string | undefined>) => {
    const n = new URLSearchParams(qs);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") n.delete(k);
      else n.set(k, v);
    }
    return `/audit?${n.toString()}`;
  };

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Auditoria</h1>
          <p className="mt-1 text-sm text-slate-600">Eventos registados para a sua organização (filtros via URL).</p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-amber-700 hover:underline">
          Painel
        </Link>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <input type="hidden" name="page" value="1" />
        <label className="text-sm">
          <span className="block text-slate-600">Tipo de entidade</span>
          <input
            name="entity_type"
            defaultValue={params.entity_type ?? ""}
            placeholder="ex: trip"
            className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-slate-900"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Ação</span>
          <input
            name="action"
            defaultValue={params.action ?? ""}
            placeholder="ex: trip.approve"
            className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-slate-900"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Por página</span>
          <select name="pageSize" defaultValue={String(pageSize)} className="mt-1 rounded border border-slate-300 px-2 py-1.5">
            <option value="20">20</option>
            <option value="40">40</option>
            <option value="80">80</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Filtrar
        </button>
      </form>

      {!res.ok || !payload?.success ? (
        <p className="text-sm text-red-700">Não foi possível carregar a lista de auditoria.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Quando</th>
                  <th className="px-3 py-2">Ação</th>
                  <th className="px-3 py-2">Entidade</th>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Ator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => (
                  <tr key={row.id} className="text-slate-800">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">
                      {new Date(row.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}
                    </td>
                    <td className="px-3 py-2 font-medium text-amber-800">{row.action}</td>
                    <td className="px-3 py-2">{row.entity_type}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 font-mono text-xs">{row.entity_id ?? "—"}</td>
                    <td className="max-w-[120px] truncate px-3 py-2 font-mono text-xs">{row.actor_user_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>
              Página {page} de {totalPages} · {total} eventos
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
