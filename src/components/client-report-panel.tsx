"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { shortAddress } from "@/lib/client/short-address";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { STATUS_LABEL, brToday } from "@/lib/operations/booking-periods";

type Client = { id: string; name: string; trade_name?: string | null; type: string };
type Trip = {
  id: string;
  scheduled_at: string;
  operational_status: string;
  origin_text: string;
  destination_text: string;
  passenger_name?: string | null;
  driver_name?: string | null;
  vehicle?: { model?: string | null; plate?: string | null } | null;
  client_amount?: number | null;
  driver_amount?: number | null;
  km_billable?: number | null;
  wait_minutes?: number | null;
  service_type?: string | null;
  client_invoice_id?: string | null;
  notes?: string | null;
};

const CANCELLED = new Set(["cancelled", "rejected", "no_show"]);
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(`${ym}-01T00:00:00-03:00`).toISOString();
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const to = new Date(new Date(`${next}-01T00:00:00-03:00`).getTime() - 1).toISOString();
  return { from, to };
}

function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function MoneyCell({
  value,
  locked,
  onSave
}: {
  value: number | null | undefined;
  locked: boolean;
  onSave: (v: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(value != null && num(value) > 0 ? String(value).replace(".", ",") : "");
  const [state, setState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  useEffect(() => {
    setText(value != null && num(value) > 0 ? String(value).replace(".", ",") : "");
  }, [value]);
  const original = value != null && num(value) > 0 ? String(value).replace(".", ",") : "";
  return (
    <div className="flex items-center justify-end gap-1">
      <input
        className={`w-24 rounded-md border px-2 py-1 text-right text-sm ${
          !text ? "border-amber-400 bg-amber-50" : "border-prime-border bg-white"
        } ${state === "ok" ? "ring-1 ring-emerald-400" : state === "error" ? "ring-1 ring-red-400" : ""}`}
        inputMode="decimal"
        placeholder="—"
        value={text}
        title={locked ? "Corrida já está numa fatura: ao mudar, confira a fatura." : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onBlur={async () => {
          if (text === original) return;
          setState("saving");
          const ok = await onSave(text);
          setState(ok ? "ok" : "error");
          if (!ok) setText(original);
        }}
      />
    </div>
  );
}

/** Relatório de fechamento de um cliente: corridas do mês com valores editáveis e totais. */
export function ClientReportPanel() {
  const router = useRouter();
  const sp = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const clientId = sp.get("cliente") ?? "";
  const ym = sp.get("mes") ?? brToday().slice(0, 7);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const setParams = (cliente: string, mes: string) =>
    router.replace(`/clients/relatorio?cliente=${cliente}&mes=${mes}` as Route, { scroll: false });

  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/clients?include_inactive=1", {}, "admin");
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Client[] };
      if (res.ok && json.success) setClients(json.data ?? []);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!clientId) {
      setTrips([]);
      return;
    }
    setLoading(true);
    const { from, to } = monthRange(ym);
    const qs = new URLSearchParams({ clientId, scheduledFrom: from, scheduledTo: to, pageSize: "300", sortDir: "asc" });
    const res = await fetchWithSupabaseSession(`/api/trips?${qs}`, {}, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { items: Trip[] }; error?: { message?: string } };
    if (res.ok && json.success) {
      setTrips(json.data?.items ?? []);
      setError(null);
    } else setError(json.error?.message ?? "Não foi possível carregar as corridas.");
    setLoading(false);
  }, [clientId, ym]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAmount(tripId: string, field: "client_amount" | "driver_amount", text: string) {
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/amounts`,
      { method: "PATCH", body: JSON.stringify({ [field]: text.trim() === "" ? null : text }) },
      "admin"
    );
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { client_amount: number | null; driver_amount: number | null } };
    if (!res.ok || !json.success) return false;
    setTrips((list) => list.map((t) => (t.id === tripId ? { ...t, ...json.data } : t)));
    return true;
  }

  const client = clients.find((c) => c.id === clientId) ?? null;

  const stats = useMemo(() => {
    let done = 0;
    let cancelled = 0;
    let open = 0;
    let billed = 0;
    let payout = 0;
    let km = 0;
    let missing = 0;
    for (const t of trips) {
      if (CANCELLED.has(t.operational_status)) {
        cancelled += 1;
        continue;
      }
      if (t.operational_status === "completed") {
        done += 1;
        billed += num(t.client_amount);
        payout += num(t.driver_amount);
        km += num(t.km_billable);
        if (num(t.client_amount) <= 0) missing += 1;
      } else open += 1;
    }
    return { done, cancelled, open, billed, payout, margin: billed - payout, km, missing };
  }, [trips]);

  const visible = trips.filter((t) => {
    if (!showCancelled && CANCELLED.has(t.operational_status)) return false;
    if (onlyProblems) return t.operational_status === "completed" && num(t.client_amount) <= 0;
    return true;
  });

  function exportCsv() {
    const head = ["Data", "Nº", "Situação", "Passageiro", "Embarque", "Destino", "Motorista", "Placa", "KM", "Valor cliente", "Valor motorista", "Faturada"];
    const rows = visible.map((t) => [
      formatBrDateTime(t.scheduled_at),
      t.id.slice(0, 6).toUpperCase(),
      STATUS_LABEL[t.operational_status] ?? t.operational_status,
      t.passenger_name ?? "",
      t.origin_text,
      t.destination_text,
      t.driver_name ?? "",
      t.vehicle?.plate ?? "",
      t.km_billable ?? "",
      num(t.client_amount).toFixed(2).replace(".", ","),
      num(t.driver_amount).toFixed(2).replace(".", ","),
      t.client_invoice_id ? "sim" : "não"
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-${(client?.trade_name || client?.name || "cliente").replace(/\s+/g, "-").toLowerCase()}-${ym}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="grid gap-1 text-sm">
          <span className="text-prime-muted">Cliente</span>
          <select className={`${PRIME_INPUT_CLASS} min-w-[260px]`} value={clientId} onChange={(e) => setParams(e.target.value, ym)}>
            <option value="">Escolha o cliente…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.trade_name || c.name}
                {c.type === "PF" ? " (pessoa física)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-1 text-sm">
          <span className="text-prime-muted">Mês</span>
          <div className="flex items-center gap-1">
            <button type="button" className="h-9 w-9 rounded-lg ring-1 ring-prime-border" onClick={() => setParams(clientId, shiftMonth(ym, -1))}>
              ‹
            </button>
            <input type="month" className={`${PRIME_INPUT_CLASS} w-40`} value={ym} onChange={(e) => e.target.value && setParams(clientId, e.target.value)} />
            <button type="button" className="h-9 w-9 rounded-lg ring-1 ring-prime-border" onClick={() => setParams(clientId, shiftMonth(ym, 1))}>
              ›
            </button>
          </div>
        </div>
        {client ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="rounded-lg px-3 py-2 text-sm ring-1 ring-prime-border hover:ring-prime-gold" onClick={exportCsv}>
              Baixar planilha
            </button>
            <button type="button" className="rounded-lg px-3 py-2 text-sm ring-1 ring-prime-border hover:ring-prime-gold" onClick={() => window.print()}>
              Imprimir / PDF
            </button>
            <Link href={"/finance" as Route} className="btn-primary">
              Ir para faturas →
            </Link>
          </div>
        ) : null}
      </div>

      {!clientId ? (
        <p className="rounded-2xl border border-dashed border-prime-border bg-white p-10 text-center text-sm text-prime-muted">
          Escolha um cliente para ver todas as corridas do mês.
        </p>
      ) : (
        <>
          <div className="hidden print:block">
            <p className="text-xl font-semibold">{client?.trade_name || client?.name}</p>
            <p className="text-sm">Relatório de corridas · {monthLabel(ym)}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Finalizadas", String(stats.done)],
              ["Em aberto", String(stats.open)],
              ["Canceladas", String(stats.cancelled)],
              ["Total do cliente", money(stats.billed)],
              ["Total motoristas", money(stats.payout)],
              ["Margem", money(stats.margin)]
            ].map(([label, value], i) => (
              <div
                key={label}
                className={`rounded-2xl border p-4 shadow-prime-card ${i === 3 ? "border-[#111] bg-[#111]" : "border-prime-border bg-white"}`}
              >
                <p className={`text-xs ${i === 3 ? "text-prime-gold" : "text-prime-muted"}`}>{label}</p>
                <p className={`mt-1 text-xl font-semibold ${i === 3 ? "text-[#fff]" : ""}`}>{value}</p>
              </div>
            ))}
          </div>

          {stats.missing > 0 ? (
            <button
              type="button"
              onClick={() => setOnlyProblems((v) => !v)}
              className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm font-medium text-amber-900 print:hidden"
            >
              ⚠ {stats.missing} corrida(s) finalizada(s) sem valor. {onlyProblems ? "Mostrar todas" : "Mostrar só essas"} →
            </button>
          ) : null}

          <div className="flex flex-wrap items-center gap-4 text-sm print:hidden">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
              Mostrar canceladas
            </label>
            <span className="text-prime-muted">
              Para corrigir um valor, clique nele, digite e aperte Enter. Salva sozinho.
            </span>
          </div>

          {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

          <div className="overflow-x-auto rounded-2xl border border-prime-border bg-white shadow-prime-card">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-prime-bg text-left text-xs uppercase tracking-wide text-prime-muted">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Passageiro e trajeto</th>
                  <th className="px-3 py-2">Motorista</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2 text-right">KM</th>
                  <th className="px-3 py-2 text-right">Cliente paga</th>
                  <th className="px-3 py-2 text-right">Motorista recebe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-prime-border">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-prime-muted">
                      Carregando…
                    </td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-prime-muted">
                      Nenhuma corrida neste mês.
                    </td>
                  </tr>
                ) : (
                  visible.map((t) => {
                    const cancelled = CANCELLED.has(t.operational_status);
                    const locked = Boolean(t.client_invoice_id);
                    return (
                      <tr key={t.id} className={cancelled ? "text-prime-muted line-through" : ""}>
                        <td className="whitespace-nowrap px-3 py-2 align-top">
                          <Link href={`/agenda?trip=${t.id}#trip-detail` as Route} className="font-medium hover:text-prime-gold">
                            {formatBrDateTime(t.scheduled_at)}
                          </Link>
                          <p className="text-xs text-prime-muted">Nº {t.id.slice(0, 6).toUpperCase()}</p>
                        </td>
                        <td className="max-w-[320px] px-3 py-2 align-top">
                          <p className="truncate font-medium">{t.passenger_name || "—"}</p>
                          <p className="truncate text-xs text-prime-muted">
                            {shortAddress(t.origin_text)} → {shortAddress(t.destination_text)}
                          </p>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <p className="truncate">{t.driver_name ?? "—"}</p>
                          {t.vehicle?.plate ? <p className="text-xs text-prime-muted">{t.vehicle.plate}</p> : null}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <p>{STATUS_LABEL[t.operational_status] ?? t.operational_status}</p>
                          {locked ? <p className="text-xs font-medium text-emerald-700">Na fatura</p> : null}
                        </td>
                        <td className="px-3 py-2 text-right align-top">{t.km_billable ? num(t.km_billable).toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-3 py-2 align-top">
                          {cancelled ? (
                            <p className="text-right">—</p>
                          ) : (
                            <MoneyCell value={t.client_amount} locked={locked} onSave={(v) => saveAmount(t.id, "client_amount", v)} />
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {cancelled ? (
                            <p className="text-right">—</p>
                          ) : (
                            <MoneyCell value={t.driver_amount} locked={locked} onSave={(v) => saveAmount(t.id, "driver_amount", v)} />
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {visible.length > 0 ? (
                <tfoot className="bg-prime-bg font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={4}>
                      Total das finalizadas ({stats.done})
                    </td>
                    <td className="px-3 py-2 text-right">{stats.km ? stats.km.toLocaleString("pt-BR") : ""}</td>
                    <td className="px-3 py-2 text-right">{money(stats.billed)}</td>
                    <td className="px-3 py-2 text-right">{money(stats.payout)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
