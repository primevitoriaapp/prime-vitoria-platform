"use client";

import { useState } from "react";

export type FormLang = "pt" | "en" | "es";

const TYPE_IDS = ["aeroporto", "transfer", "diaria", "casamento", "turismo", "evento"] as const;
/** O valor enviado para a central fica sempre em português. */
const VEHICLES = ["Sedan executivo", "SUV premium", "Van executiva", "Micro-ônibus / ônibus", "Blindado", "Não sei"];

const L = {
  pt: {
    types: ["Aeroporto", "Transfer", "Diária", "Casamento", "Turismo", "Evento / grupo"],
    vehicles: VEHICLES,
    servico: "Qual serviço?", data: "Data", inicio: "Início", horario: "Horário",
    ondeComeca: "Onde começa", embarqueAero: "Embarque (aeroporto, hotel ou endereço)", embarque: "Embarque",
    roteiro: "Roteiro (opcional)", destino: "Destino", phAero: "Ex.: Aeroporto de Vitória", phLocal: "Endereço ou local", phRoteiro: "Ex.: igreja, festa e volta",
    pessoas: "Pessoas", veiculo: "Veículo", escolher: "Escolher…", nome: "Seu nome", whats: "WhatsApp", phPhone: "(27) 9 9999-9999",
    email: "E-mail (opcional)", obs: "Observações", phObs: "Voo, bagagens, cadeirinha, decoração para noiva…",
    enviar: "Pedir orçamento", enviando: "Enviando…", erro: "Confira os campos e tente de novo.",
    ok: "Pedido recebido!", okSub: (e: boolean) => `Nossa central vai te mandar o orçamento pelo WhatsApp ${e ? "e por e-mail " : ""}em breve.`
  },
  en: {
    types: ["Airport", "Transfer", "By the hour", "Wedding", "Sightseeing", "Event / group"],
    vehicles: ["Executive sedan", "Premium SUV", "Executive van", "Minibus / coach", "Armored car", "Not sure"],
    servico: "Which service?", data: "Date", inicio: "Start time", horario: "Pickup time",
    ondeComeca: "Starting point", embarqueAero: "Pickup (airport, hotel or address)", embarque: "Pickup",
    roteiro: "Itinerary (optional)", destino: "Drop-off", phAero: "e.g. Vitória Airport (VIX)", phLocal: "Address or place", phRoteiro: "e.g. hotel, meetings and back",
    pessoas: "Passengers", veiculo: "Vehicle", escolher: "Choose…", nome: "Your name", whats: "WhatsApp / phone (with country code)", phPhone: "+1 555 123 4567",
    email: "E-mail (optional)", obs: "Notes", phObs: "Flight number, luggage, child seat…",
    enviar: "Request a quote", enviando: "Sending…", erro: "Please check the fields and try again.",
    ok: "Request received!", okSub: (e: boolean) => `Our team will send your quote on WhatsApp ${e ? "and by e-mail " : ""}shortly.`
  },
  es: {
    types: ["Aeropuerto", "Traslado", "Por horas", "Boda", "Turismo", "Evento / grupo"],
    vehicles: ["Sedán ejecutivo", "SUV premium", "Van ejecutiva", "Minibús / autobús", "Blindado", "No sé"],
    servico: "¿Qué servicio?", data: "Fecha", inicio: "Inicio", horario: "Hora de recogida",
    ondeComeca: "Punto de inicio", embarqueAero: "Recogida (aeropuerto, hotel o dirección)", embarque: "Recogida",
    roteiro: "Itinerario (opcional)", destino: "Destino", phAero: "Ej.: Aeropuerto de Vitória (VIX)", phLocal: "Dirección o lugar", phRoteiro: "Ej.: hotel, reuniones y regreso",
    pessoas: "Pasajeros", veiculo: "Vehículo", escolher: "Elegir…", nome: "Tu nombre", whats: "WhatsApp / teléfono (con código de país)", phPhone: "+54 9 11 1234 5678",
    email: "E-mail (opcional)", obs: "Observaciones", phObs: "Número de vuelo, equipaje, silla de niño…",
    enviar: "Pedir cotización", enviando: "Enviando…", erro: "Revisa los campos e inténtalo de nuevo.",
    ok: "¡Solicitud recibida!", okSub: (e: boolean) => `Nuestro equipo te enviará la cotización por WhatsApp ${e ? "y por e-mail " : ""}en breve.`
  }
} as const;

const field = "w-full rounded-xl border border-[#DDD5C2] bg-white px-4 py-3 text-base text-[#111] outline-none focus:border-[#C9A84C]";

export function PublicRequestForm({ lang = "pt" }: { lang?: FormLang }) {
  const t = L[lang];
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
    const res = await fetch("/api/public/pedido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, lang }) });
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !j.success) return setErr(lang === "pt" ? (j.error?.message ?? t.erro) : t.erro);
    setDone(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (done) {
    return (
      <section className="rounded-3xl bg-white p-6 text-center shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <p className="text-4xl">✓</p>
        <h2 className="mt-2 text-xl font-semibold text-[#111]">{t.ok}</h2>
        <p className="mt-2 text-sm text-[#555]">{t.okSub(Boolean(f.email))}</p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <input tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={set("website")} aria-hidden />
      <div>
        <p className="mb-2 text-sm font-semibold text-[#111]">{t.servico}</p>
        <div className="grid grid-cols-3 gap-2">
          {TYPE_IDS.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setF({ ...f, type: id })}
              className={`rounded-xl px-2 py-3 text-sm font-medium ring-1 ${f.type === id ? "bg-[#111] text-[#C9A84C] ring-[#111]" : "bg-white text-[#111] ring-[#DDD5C2]"}`}
            >
              {t.types[i]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-[#555]">
          {t.data}
          <input type="date" required min={today} className={field} value={f.date} onChange={set("date")} />
        </label>
        <label className="text-sm text-[#555]">
          {isDiaria ? t.inicio : t.horario}
          <input type="time" className={field} value={f.time} onChange={set("time")} />
        </label>
      </div>
      <label className="block text-sm text-[#555]">
        {isDiaria ? t.ondeComeca : f.type === "aeroporto" ? t.embarqueAero : t.embarque}
        <input required className={field} value={f.origin} onChange={set("origin")} placeholder={f.type === "aeroporto" ? t.phAero : t.phLocal} />
      </label>
      <label className="block text-sm text-[#555]">
        {isDiaria ? t.roteiro : t.destino}
        <input required={!isDiaria} className={field} value={f.destination} onChange={set("destination")} placeholder={isDiaria ? t.phRoteiro : t.phLocal} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-[#555]">
          {t.pessoas}
          <input type="number" min={1} max={200} required className={field} value={f.passengers} onChange={set("passengers")} />
        </label>
        <label className="text-sm text-[#555]">
          {t.veiculo}
          <select className={field} value={f.vehicle} onChange={set("vehicle")}>
            <option value="">{t.escolher}</option>
            {VEHICLES.map((v, i) => (
              <option key={v} value={v}>
                {t.vehicles[i]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <hr className="border-[#EEE9DC]" />
      <label className="block text-sm text-[#555]">
        {t.nome}
        <input required className={field} value={f.name} onChange={set("name")} autoComplete="name" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-[#555]">
          {t.whats}
          <input required type="tel" inputMode="tel" className={field} value={f.phone} onChange={set("phone")} placeholder={t.phPhone} autoComplete="tel" />
        </label>
        <label className="text-sm text-[#555]">
          {t.email}
          <input type="email" className={field} value={f.email} onChange={set("email")} autoComplete="email" />
        </label>
      </div>
      <label className="block text-sm text-[#555]">
        {t.obs}
        <textarea className={`${field} min-h-[90px]`} value={f.notes} onChange={set("notes")} placeholder={t.phObs} />
      </label>
      {err ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      <button type="submit" disabled={busy} className="w-full rounded-2xl bg-[#111] px-4 py-4 text-base font-semibold text-[#C9A84C] disabled:opacity-60">
        {busy ? t.enviando : t.enviar}
      </button>
    </form>
  );
}
