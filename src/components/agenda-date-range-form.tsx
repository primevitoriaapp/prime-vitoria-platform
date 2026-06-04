"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DateInput } from "@/components/date-input";
import {
  brDateToEndOfDayIso,
  brDateToStartOfDayIso,
  normalizeDateFieldForStorage
} from "@/lib/dates/br-date";

type Props = {
  initialFromIso: string;
  initialToIso: string;
};

export function AgendaDateRangeForm({ initialFromIso, initialToIso }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState<string | null>(() => normalizeDateFieldForStorage(initialFromIso));
  const [to, setTo] = useState<string | null>(() => normalizeDateFieldForStorage(initialToIso));

  const defaults = useMemo(
    () => ({
      from: normalizeDateFieldForStorage(initialFromIso),
      to: normalizeDateFieldForStorage(initialToIso)
    }),
    [initialFromIso, initialToIso]
  );

  function applyRange(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (from) {
      const start = brDateToStartOfDayIso(from);
      if (start) params.set("scheduledFrom", start);
    }
    if (to) {
      const end = brDateToEndOfDayIso(to);
      if (end) params.set("scheduledTo", end);
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
    <form
      onSubmit={applyRange}
      className="card mb-6 flex flex-wrap items-end gap-3 border border-gray-200 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
    >
      <label className="text-sm text-slate-700">
        <span className="mb-1 block text-slate-500">De</span>
        <DateInput
          className="rounded border border-slate-300 px-2 py-1.5 text-slate-900"
          value={from}
          onChange={setFrom}
        />
      </label>
      <label className="text-sm text-slate-700">
        <span className="mb-1 block text-slate-500">Até</span>
        <DateInput
          className="rounded border border-slate-300 px-2 py-1.5 text-slate-900"
          value={to}
          onChange={setTo}
        />
      </label>
      <button type="submit" className="btn-primary">
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
