"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SAO_PAULO_TZ } from "@/lib/dates/br-date";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

function currentMonthBoundsIso(): { from: string; to: string } {
  const now = new Date();
  const year = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: SAO_PAULO_TZ, year: "numeric" }).format(now)
  );
  const month = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: SAO_PAULO_TZ, month: "numeric" }).format(now)
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad(month)}-01T00:00:00-03:00`,
    to: `${year}-${pad(month)}-${pad(lastDay)}T23:59:59-03:00`
  };
}

function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type PayableRow = {
  id: string;
  trip_id: string;
  driver_id: string;
  amount: number;
  due_date: string;
  status: string;
  days_until_due?: number;
  overdue?: boolean;
  due_label?: string;
  trip?: {
    scheduled_label: string | null;
    route_label: string | null;
    passenger_name: string | null;
    planned_km: number | null;
    actual_km: number | null;
    wait_minutes: number | null;
    started_label: string | null;
    completed_label: string | null;
  } | null;
};

type Props = {
  tenantId: string | null;
  driverIdFilter?: string | null;
  devFallbackRole?: "financeiro" | "admin" | "motorista";
};

export function DriverPayablesPanel({
  tenantId,
  driverIdFilter = null,
  devFallbackRole = "financeiro"
}: Props) {
  const financeStaff = devFallbackRole === "financeiro" || devFallbackRole === "admin";
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "paid" | "cancelled">("open");
  const [items, setItems] = useState<PayableRow[]>([]);
  const [historyItems, setHistoryItems] = useState<PayableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<Record<string, string>>({});
  const [monthTrips, setMonthTrips] = useState(0);
  const [openSummary, setOpenSummary] = useState({ total: 0, overdue: 0, count: 0 });

  const loadWalletSummary = useCallback(async () => {
    if (financeStaff) return;

    const openQs = new URLSearchParams({ page: "1", pageSize: "200", status: "open" });
    if (driverIdFilter) openQs.set("driverId", driverIdFilter);

    const { from, to } = currentMonthBoundsIso();
    const tripsQs = new URLSearchParams({
      page: "1",
      pageSize: "1",
      status: "completed",
      scheduledFrom: from,
      scheduledTo: to
    });
    if (driverIdFilter) tripsQs.set("driverId", driverIdFilter);

    const [openRes, tripsRes] = await Promise.all([
      fetchWithSupabaseSession(`/api/finance/driver-payables?${openQs}`, {}, devFallbackRole),
      fetchWithSupabaseSession(`/api/trips?${tripsQs}`, {}, devFallbackRole)
    ]);

    const openJson = (await openRes.json()) as {
      success?: boolean;
      data?: { items: PayableRow[] };
    };
    const tripsJson = (await tripsRes.json()) as {
      success?: boolean;
      data?: { total: number };
    };

    if (openRes.ok && openJson.success) {
      const openItems = openJson.data?.items ?? [];
      const total = openItems.reduce((sum, row) => sum + Number(row.amount), 0);
      const overdue = openItems
        .filter((row) => row.overdue)
        .reduce((sum, row) => sum + Number(row.amount), 0);
      setOpenSummary({ total, overdue, count: openItems.length });
    } else {
      setOpenSummary({ total: 0, overdue: 0, count: 0 });
    }

    if (tripsRes.ok && tripsJson.success) {
      setMonthTrips(tripsJson.data?.total ?? 0);
    } else {
      setMonthTrips(0);
    }
  }, [financeStaff, driverIdFilter, devFallbackRole]);

  const loadHistory = useCallback(async () => {
    if (financeStaff) return;
    const qs = new URLSearchParams({ page: "1", pageSize: "30", status: "paid" });
    if (driverIdFilter) qs.set("driverId", driverIdFilter);
    const res = await fetchWithSupabaseSession(`/api/finance/driver-payables?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: PayableRow[] };
    };
    if (res.ok && json.success) {
      setHistoryItems(json.data?.items ?? []);
    } else {
      setHistoryItems([]);
    }
  }, [financeStaff, driverIdFilter, devFallbackRole]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const qs = new URLSearchParams({ page: "1", pageSize: "40" });
    if (statusFilter) qs.set("status", statusFilter);
    if (driverIdFilter) qs.set("driverId", driverIdFilter);

    const res = await fetchWithSupabaseSession(`/api/finance/driver-payables?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: PayableRow[]; total: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setItems([]);
      setTotal(0);
      setMessage(json.error?.message ?? "Não foi possível carregar contas a pagar.");
      setLoading(false);
      return;
    }
    setItems(json.data?.items ?? []);
    setTotal(json.data?.total ?? 0);
    setLoading(false);
  }, [statusFilter, devFallbackRole, driverIdFilter]);

  useEffect(() => {
    void load();
    void loadWalletSummary();
    void loadHistory();
  }, [load, loadWalletSummary, loadHistory]);

  useTenantTableRefresh(tenantId, ["driver_payables"], () => {
    void load();
    void loadWalletSummary();
    void loadHistory();
  });

  const walletCards = useMemo(
    () => [
      {
        label: "Saldo pendente",
        value: formatBrl(openSummary.overdue > 0 ? openSummary.overdue : openSummary.total),
        hint:
          openSummary.overdue > 0
            ? `${openSummary.count} título(s) em aberto`
            : openSummary.count > 0
              ? `${openSummary.count} título(s) em aberto`
              : "Nenhum título em aberto"
      },
      {
        label: "Corridas do mês",
        value: String(monthTrips),
        hint: "Concluídas no mês actual"
      },
      {
        label: "Valor a receber",
        value: formatBrl(openSummary.total),
        hint: "Total em aberto"
      }
    ],
    [openSummary, monthTrips]
  );

  async function postAction(id: string, path: "mark-paid" | "reopen" | "cancel", body: Record<string, unknown> = {}) {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/finance/driver-payables/${id}/${path}`,
      { method: "POST", body: JSON.stringify(body) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Operação não concluída.");
      return false;
    }
    return true;
  }

  async function markPaid(id: string) {
    if (await postAction(id, "mark-paid", { payment_method: "pix" })) await load();
  }

  async function reopen(id: string) {
    if (await postAction(id, "reopen", { reason: "estorno" })) await load();
  }

  async function cancelPayable(id: string) {
    if (await postAction(id, "cancel", { reason: "cancelamento" })) await load();
  }

  async function attachProofUrl(id: string) {
    const url = proofUrl[id]?.trim();
    if (!url) {
      setMessage("Indique URL do comprovante.");
      return;
    }
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/finance/driver-payables/${id}/proof`,
      { method: "POST", body: JSON.stringify({ storage_url: url }) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao registar comprovante.");
      return;
    }
    setMessage("Comprovante registado (URL).");
  }

  async function uploadProofFile(id: string, file: File) {
    setMessage(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetchWithSupabaseSession(
      `/api/finance/driver-payables/${id}/proof/upload`,
      { method: "POST", body: form },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha no upload.");
      return;
    }
    setMessage("Comprovante enviado para storage.");
  }

  const sectionClass = financeStaff ? "card mt-6" : "";
  const titleClass = financeStaff ? "text-lg font-semibold text-slate-900" : "text-base font-semibold text-prime-text";
  const mutedClass = financeStaff ? "text-slate-600" : "text-prime-muted";
  const errorClass = financeStaff ? "text-red-700" : "text-red-400";

  return (
    <section className={sectionClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={titleClass}>
          {financeStaff ? "Contas a pagar (motoristas)" : "Carteira"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className={
              financeStaff
                ? "rounded border border-slate-300 px-2 py-1 text-sm"
                : "rounded-lg border border-prime-border bg-prime-surface px-2 py-1 text-sm text-prime-text"
            }
          >
            <option value="open">Em aberto</option>
            <option value="paid">Pagas</option>
            <option value="cancelled">Canceladas</option>
            <option value="">Todas</option>
          </select>
          <button
            type="button"
            onClick={() => {
              void load();
              void loadWalletSummary();
              void loadHistory();
            }}
            disabled={loading}
            className="text-sm text-prime-gold"
          >
            Actualizar
          </button>
        </div>
      </div>

      {!financeStaff ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {walletCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-prime-border bg-prime-surface/60 p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-prime-muted">{card.label}</p>
              <p className="mt-1 text-xl font-semibold text-prime-text">{card.value}</p>
              <p className="mt-1 text-[11px] text-prime-muted">{card.hint}</p>
            </div>
          ))}
        </div>
      ) : null}

      {message ? <p className={`mt-2 text-sm ${errorClass}`}>{message}</p> : null}
      {loading ? (
        <p className={`mt-3 text-sm ${mutedClass}`}>A carregar…</p>
      ) : items.length === 0 ? (
        <p className={`mt-3 text-sm ${financeStaff ? "text-slate-500" : "text-prime-muted"}`}>
          Sem títulos ({total} no total).
        </p>
      ) : financeStaff ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-2">Vencimento</th>
                <th className="py-2 pr-2">Previsão</th>
                <th className="py-2 pr-2">Valor</th>
                <th className="py-2 pr-2">Estado</th>
                <th className="py-2 pr-2">Comprovante</th>
                <th className="py-2">Acções</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2 pr-2">{row.due_date}</td>
                  <td className={`py-2 pr-2 ${row.overdue ? "font-medium text-red-700" : ""}`}>
                    {row.due_label ?? "—"}
                  </td>
                  <td className="py-2 pr-2">
                    {Number(row.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td className="py-2 pr-2">{row.status}</td>
                  <td className="py-2 pr-2">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="max-w-[10rem] text-xs"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadProofFile(row.id, f);
                        e.target.value = "";
                      }}
                    />
                    <input
                      type="url"
                      placeholder="ou URL"
                      value={proofUrl[row.id] ?? ""}
                      onChange={(e) => setProofUrl((p) => ({ ...p, [row.id]: e.target.value }))}
                      className="mt-1 w-40 rounded border border-slate-300 px-1 py-0.5 text-xs"
                    />
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="text-xs text-amber-800" onClick={() => void attachProofUrl(row.id)}>
                        URL
                      </button>
                      {financeStaff && row.status === "open" ? (
                        <>
                          <button type="button" className="text-xs text-emerald-800" onClick={() => void markPaid(row.id)}>
                            Marcar paga
                          </button>
                          <button type="button" className="text-xs text-slate-600" onClick={() => void cancelPayable(row.id)}>
                            Cancelar
                          </button>
                        </>
                      ) : null}
                      {financeStaff && row.status === "paid" ? (
                        <button type="button" className="text-xs text-amber-800" onClick={() => void reopen(row.id)}>
                          Estornar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {items.length > 0 ? (
            <>
              <h3 className="mt-4 text-sm font-medium text-prime-muted">A receber</h3>
              <ul className="mt-2 space-y-3">
                {items.map((row) => (
                  <DriverPayableTripCard key={row.id} row={row} />
                ))}
              </ul>
            </>
          ) : (
            <p className={`mt-3 text-sm ${mutedClass}`}>Nenhum título em aberto.</p>
          )}
          {historyItems.length > 0 ? (
            <>
              <h3 className="mt-6 text-sm font-medium text-prime-muted">Histórico de corridas</h3>
              <ul className="mt-2 space-y-3">
                {historyItems.map((row) => (
                  <DriverPayableTripCard key={row.id} row={row} />
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

function DriverPayableTripCard({ row }: { row: PayableRow }) {
  return (
    <li className="rounded-xl border border-prime-border bg-prime-surface/40 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-prime-text">
            {Number(row.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
          {row.trip?.scheduled_label ? (
            <p className="mt-0.5 text-xs text-prime-muted">Agendada {row.trip.scheduled_label}</p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full border border-prime-border px-2 py-0.5 text-[10px] uppercase text-prime-muted">
          {row.status}
        </span>
      </div>

      {row.trip?.route_label ? <p className="mt-2 text-sm text-prime-text">{row.trip.route_label}</p> : null}
      {row.trip?.passenger_name ? (
        <p className="mt-1 text-xs text-prime-muted">Passageiro: {row.trip.passenger_name}</p>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-prime-muted">Km rodado</dt>
          <dd className="font-medium text-prime-text">
            {row.trip?.actual_km != null
              ? `${row.trip.actual_km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`
              : row.trip?.planned_km != null
                ? `${row.trip.planned_km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km (prev.)`
                : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-prime-muted">Tempo de espera</dt>
          <dd className="font-medium text-prime-text">
            {row.trip?.wait_minutes != null && row.trip.wait_minutes > 0 ? `${row.trip.wait_minutes} min` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-prime-muted">Início</dt>
          <dd className="font-medium text-prime-text">{row.trip?.started_label ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-prime-muted">Fim</dt>
          <dd className="font-medium text-prime-text">{row.trip?.completed_label ?? "—"}</dd>
        </div>
      </dl>

      <p className={`mt-3 text-xs ${row.overdue ? "font-medium text-red-400" : "text-prime-muted"}`}>
        Vencimento {row.due_date}
        {row.due_label ? ` · ${row.due_label}` : ""}
      </p>
    </li>
  );
}
