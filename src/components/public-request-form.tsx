"use client";

import { useState } from "react";

const TYPES = [
  { id: "aeroporto", label: "Aeroporto" },
  { id: "transfer", label: "Transfer" },
  { id: "diaria", label: "Diária" },
  { id: "casamento", label: "Casamento" },
  { id: "turismo", label: "Turismo" },
  { id: "evento", label: "Evento / grupo" }
];
const VEHICLES = ["Sedan executivo", "SUV premium", "Van executiva", "Micro-ônibus / ônibus", "Blindado", "Não sei"];

const field = "w-full rounded-xl border border-[#DDD5C2] bg-white px-4 py-3 text-base text-[#111] outline-none focus:border-[#C9A84C]";

export function PublicRequestForm() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [f, setF] = useState({ website: "", name: "", phone: "", email: "", type: "aeroporto", date: "", time: "", origin: "", destination: "", passengers: "1", vehicle: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const isDiaria = ["diaria", "casamento", "turismo"].includes(f.type);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/public/pedido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !j.success) return setErr(j.error?.message ?? "Confira os campos e tente de novo.");
    setDone(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (done) {
    return (
      <section className="rounded-3xl bg-white p-6 text-center shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <p className="text-4xl">✓</p>
        <h2 className="mt-2 text-xl font-semibold text-[#111]">Pedido recebido!</h2>
        <p className="mt-2 text-sm text-[#555]">Nossa central vai te mandar o orçamento pelo WhatsApp {f.email ? "e por e-mail " : ""}em breve.</p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <input tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={set("website")} aria-hidden />
      <div>
        <p className="mb-2 text-sm font-semibold text-[#111]">Qual serviço?</p>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setF({ ...f, type: t.id })}
              className={`rounded-xl px-2 py-3 text-sm font-medium ring-1 ${f.type === t.id ? "bg-[#111] text-[#C9A84C] ring-[#111]" : "bg-white text-[#111] ring-[#DDD5C2]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-[#555]">
          Data
          <input type="date" required min={today} className={field} value={f.date} onChange={set("date")} />
        </label>
        <label className="text-sm text-[#555]">
          {isDiaria ? "Início" : "Horário"}
          <input type="time" className={field} value={f.time} onChange={set("time")} />
        </label>
      </div>
      <label className="block text-sm text-[#555]">
        {isDiaria ? "Onde começa" : f.type === "aeroporto" ? "Embarque (aeroporto, hotel ou endereço)" : "Embarque"}
        <input required className={field} value={f.origin} onChange={set("origin")} placeholder={f.type === "aeroporto" ? "Ex.: Aeroporto de Vitória" : "Endereço ou local"} />
      </label>
      <label className="block text-sm text-[#555]">
        {isDiaria ? "Roteiro (opcional)" : "Destino"}
        <input required={!isDiaria} className={field} value={f.destination} onChange={set("destination")} placeholder={isDiaria ? "Ex.: igreja, festa e volta" : "Endereço ou local"} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-[#555]">
          Pessoas
          <input type="number" min={1} max={200} required className={field} value={f.passengers} onChange={set("passengers")} />
        </label>
        <label className="text-sm text-[#555]">
          Veículo
          <select className={field} value={f.vehicle} onChange={set("vehicle")}>
            <option value="">Escolher…</option>
            {VEHICLES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <hr className="border-[#EEE9DC]" />
      <label className="block text-sm text-[#555]">
        Seu nome
        <input required className={field} value={f.name} onChange={set("name")} autoComplete="name" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-[#555]">
          WhatsApp
          <input required type="tel" inputMode="tel" className={field} value={f.phone} onChange={set("phone")} placeholder="(27) 9 9999-9999" autoComplete="tel" />
        </label>
        <label className="text-sm text-[#555]">
          E-mail (opcional)
          <input type="email" className={field} value={f.email} onChange={set("email")} autoComplete="email" />
        </label>
      </div>
      <label className="block text-sm text-[#555]">
        Observações
        <textarea className={`${field} min-h-[90px]`} value={f.notes} onChange={set("notes")} placeholder="Voo, bagagens, cadeirinha, decoração para noiva…" />
      </label>
      {err ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      <button type="submit" disabled={busy} className="w-full rounded-2xl bg-[#111] px-4 py-4 text-base font-semibold text-[#C9A84C] disabled:opacity-60">
        {busy ? "Enviando…" : "Pedir orçamento"}
      </button>
    </form>
  );
}
