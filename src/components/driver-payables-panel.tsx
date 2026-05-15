"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

type PayableRow = {
  id: string;
  trip_id: string;
  driver_id: string;
  amount: number;
  due_date: string;
  status: string;
};

type Props = {
  tenantId: string | null;
  devFallbackRole?: "financeiro" | "admin" | "motorista";
};

export function DriverPayablesPanel({ tenantId, devFallbackRole = "financeiro" }: Props) {
  const financeStaff = devFallbackRole === "financeiro" || devFallbackRole === "admin";
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "paid" | "cancelled">("open");
  const [items, setItems] = useState<PayableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const qs = new URLSearchParams({ page: "1", pageSize: "40" });
    if (statusFilter) qs.set("status", statusFilter);

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
  }, [statusFilter, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId, ["driver_payables"], load);

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

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {financeStaff ? "Contas a pagar (motoristas)" : "Os meus pagamentos"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="open">Em aberto</option>
            <option value="paid">Pagas</option>
            <option value="cancelled">Canceladas</option>
            <option value="">Todas</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="text-sm">
            Actualizar
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-red-700">{message}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">A carregar…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sem títulos ({total} no total).</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-2">Vencimento</th>
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
      )}
    </section>
  );
}
