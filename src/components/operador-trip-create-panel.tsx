"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { buildAgendaTripHref } from "@/lib/operations/agenda-trip-href";

type ClientRow = { id: string; name: string };

type Props = {
  scheduledFrom: string;
  scheduledTo: string;
};

export function OperadorTripCreatePanel({ scheduledFrom, scheduledTo }: Props) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    client_id: "",
    service_type: "Transfer executivo",
    scheduled_at: "",
    origin_text: "",
    destination_text: "",
    passenger_name: "",
    dispatch_mode: "directed" as "directed" | "offer"
  });

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/clients", { credentials: "include" });
      const json = (await res.json()) as { success?: boolean; data?: ClientRow[] };
      if (res.ok && json.success) {
        const list = json.data ?? [];
        setClients(list);
        if (list[0] && !form.client_id) {
          setForm((f) => ({ ...f, client_id: list[0].id }));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init client_id once
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const scheduled_at = new Date(form.scheduled_at).toISOString();
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          client_id: form.client_id,
          service_type: form.service_type,
          scheduled_at,
          origin_text: form.origin_text,
          destination_text: form.destination_text,
          passenger_name: form.passenger_name || undefined,
          dispatch_mode: form.dispatch_mode
        })
      });
      const json = (await res.json()) as { success?: boolean; data?: { id: string }; error?: { message?: string } };
      if (!res.ok || !json.success || !json.data?.id) {
        throw new Error(json.error?.message ?? "Não foi possível criar a corrida.");
      }
      setMessage("Corrida criada. A abrir na agenda…");
      void scheduledFrom;
      void scheduledTo;
      router.push(buildAgendaTripHref(json.data.id, scheduled_at) as Route);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao criar corrida.");
    } finally {
      setLoading(false);
    }
  }

  const defaultDt = () => {
    const d = new Date(Date.now() + 24 * 3600_000);
    d.setMinutes(0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <section className="card mb-6 border border-emerald-200 bg-emerald-50/50">
      <h2 className="text-lg font-semibold text-slate-900">Nova corrida</h2>
      <p className="mt-1 text-sm text-slate-600">
        Crie a viagem aqui, depois assuma, aprove e despache no painel da corrida — sem UUID manual.
      </p>
      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(e) => void onSubmit(e)}>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span>Cliente corporativo</span>
          <select
            required
            className="rounded border border-slate-300 px-2 py-2"
            value={form.client_id}
            onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
          >
            <option value="">— seleccionar —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>Tipo de serviço</span>
          <input
            required
            className="rounded border border-slate-300 px-2 py-2"
            value={form.service_type}
            onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Data e hora</span>
          <input
            required
            type="datetime-local"
            className="rounded border border-slate-300 px-2 py-2"
            value={form.scheduled_at || defaultDt()}
            onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span>Origem</span>
          <input
            required
            className="rounded border border-slate-300 px-2 py-2"
            value={form.origin_text}
            onChange={(e) => setForm((f) => ({ ...f, origin_text: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span>Destino</span>
          <input
            required
            className="rounded border border-slate-300 px-2 py-2"
            value={form.destination_text}
            onChange={(e) => setForm((f) => ({ ...f, destination_text: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Passageiro</span>
          <input
            className="rounded border border-slate-300 px-2 py-2"
            value={form.passenger_name}
            onChange={(e) => setForm((f) => ({ ...f, passenger_name: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Modo despacho</span>
          <select
            className="rounded border border-slate-300 px-2 py-2"
            value={form.dispatch_mode}
            onChange={(e) =>
              setForm((f) => ({ ...f, dispatch_mode: e.target.value as "directed" | "offer" }))
            }
          >
            <option value="directed">Direcionado</option>
            <option value="offer">Por oferta</option>
          </select>
        </label>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || clients.length === 0}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {loading ? "A criar…" : "Criar e abrir na agenda"}
          </button>
          {clients.length === 0 ? (
            <span className="text-sm text-amber-800">
              Cadastre um cliente em <a href="/clients" className="underline">Clientes</a> primeiro.
            </span>
          ) : null}
        </div>
      </form>
      {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
