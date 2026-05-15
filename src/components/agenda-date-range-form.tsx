"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Props = {
  initialFromIso: string;
  initialToIso: string;
};

function toInputDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AgendaDateRangeForm({ initialFromIso, initialToIso }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(() => toInputDate(initialFromIso));
  const [to, setTo] = useState(() => toInputDate(initialToIso));

  const defaults = useMemo(
    () => ({ from: toInputDate(initialFromIso), to: toInputDate(initialToIso) }),
    [initialFromIso, initialToIso]
  );

  function applyRange(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (from) {
      const start = new Date(`${from}T00:00:00`);
      params.set("scheduledFrom", start.toISOString());
    }
    if (to) {
      const end = new Date(`${to}T23:59:59.999`);
      params.set("scheduledTo", end.toISOString());
    }
    params.set("page", "1");
    params.set("pageSize", "100");
    const path = `/agenda?${params.toString()}`;
    router.push(path as Route);
    router.refresh();
  }

  function clearFilter() {
    setFrom(defaults.from);
    setTo(defaults.to);
    router.push("/agenda" as Route);
    router.refresh();
  }

  return (
    <form onSubmit={applyRange} className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <label className="text-sm text-slate-700">
        <span className="mb-1 block text-slate-500">De</span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-slate-900"
        />
      </label>
      <label className="text-sm text-slate-700">
        <span className="mb-1 block text-slate-500">Até</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-slate-900"
        />
      </label>
      <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
        Filtrar agenda
      </button>
      <button
        type="button"
        onClick={clearFilter}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-white"
      >
        Próximas (predefinição)
      </button>
    </form>
  );
}
