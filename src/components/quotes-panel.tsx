"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { BackButton } from "@/components/back-button";
import { QUOTE_STATUS, effectiveQuoteStatus, formatQuoteNumber, isDiaria, itemHours, itemsMissingForTrips, priceKeyFor, quoteTotals, serviceLabelForClient } from "@/lib/quotes/quote-calc";
import { COMPANY_SCOPES, inCompany, useCompany } from "@/lib/company/company-context";
import { formatBrDateTime, saoPauloDateAndTimeToUtcIso } from "@/lib/dates/br-date";

type QuoteRow = {
  id: string;
  number: number;
  status: string;
  total: number;
  valid_until: string | null;
  client_name: string | null;
  contact_name: string | null;
  issuer: string | null;
  created_at: string;
};
type Category = { id: string; name: string; passengers: number; allows_km?: boolean; active?: boolean };
type Client = { id: string; name: string; trade_name?: string | null; type: string; billing_issuer?: string | null; email?: string | null };
type PriceRow = { category_id: string; service: string; enabled: boolean; client_price: number | null; partner_price: number | null };
type Item = {
  vehicle_category_id: string;
  service_mode: string;
  hours: string;
  description: string;
  date: string;
  time: string;
  origin: { text: string; lat: number | null; lng: number | null };
  dest: { text: string; lat: number | null; lng: number | null };
  passenger_count: number;
  passenger_name: string;
  quantity: number;
  unit_price: string;
  driver_amount: string;
};

const input = PRIME_INPUT_CLASS;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const plusDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const toNum = (s: string) => {
  const t = s.trim();
  if (!t) return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
};
const money2 = (n: number | null | undefined) => (n == null ? "" : Number(n).toFixed(2).replace(".", ","));

const EMPTY_ITEM = (): Item => ({
  vehicle_category_id: "",
  service_mode: "transfer",
  hours: "",
  description: "",
  date: "",
  time: "",
  origin: { text: "", lat: null, lng: null },
  dest: { text: "", lat: null, lng: null },
  passenger_count: 1,
  passenger_name: "",
  quantity: 1,
  unit_price: "",
  driver_amount: ""
});

function sortedItems(list: Item[]): Item[] {
  return list
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const ka = `${a.it.date || "9999"}${a.it.time || "99:99"}`;
      const kb = `${b.it.date || "9999"}${b.it.time || "99:99"}`;
      return ka === kb ? a.i - b.i : ka < kb ? -1 : 1;
    })
    .map((x) => x.it);
}

const HOUR_CHIPS = [4, 5, 6, 8, 10, 12, 15];

const DEFAULT_CONDITIONS =
  "Valores válidos para os serviços e datas descritos. Hora parada, pedágio e estacionamento, quando houver, são cobrados à parte. Cancelamento sem custo até 24 horas antes do serviço.";

async function api<T>(url: string, init?: RequestInit) {
  const res = await fetchWithSupabaseSession(url, init ?? {}, "admin");
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: { message?: string } };
  return { ok: res.ok && Boolean(json.success), data: json.data, error: json.error?.message };
}

/** Orçamentos: lista e editor. Aprovado vira corridas na agenda. */
export function QuotesPanel() {
  const { company } = useCompany();
  const [list, setList] = useState<QuoteRow[]>([]);
  const [openId, setOpenId] = useState<string | "novo" | null>(null);
  const [filter, setFilter] = useState("abertos");

  const load = useCallback(async () => {
    const r = await api<QuoteRow[]>("/api/quotes");
    if (r.ok) setList(r.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (openId) {
    return (
      <QuoteEditor
        id={openId === "novo" ? null : openId}
        onClose={() => {
          setOpenId(null);
          void load();
        }}
        onSaved={(id) => setOpenId(id)}
      />
    );
  }

  const t = today();
  const rows = list
    .filter((q) => inCompany(company, q.issuer))
    .map((q) => ({ ...q, st: effectiveQuoteStatus(q.status, q.valid_until, t) }))
    .filter((q) => (filter === "abertos" ? ["rascunho", "enviado"].includes(q.st) : filter === "todos" ? true : q.st === filter));
  const pipeline = list.filter((q) => inCompany(company, q.issuer) && effectiveQuoteStatus(q.status, q.valid_until, t) === "enviado").reduce((s, q) => s + Number(q.total), 0);
  const won = list.filter((q) => inCompany(company, q.issuer) && q.status === "aprovado");
  const decided = list.filter((q) => inCompany(company, q.issuer) && ["aprovado", "recusado"].includes(q.status)).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#111] bg-[#111] p-4">
          <p className="text-xs text-prime-gold">Aguardando resposta do cliente</p>
          <p className="mt-1 text-2xl font-semibold text-[#fff]">{brl(pipeline)}</p>
        </div>
        <div className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <p className="text-xs text-prime-muted">Aprovados (total)</p>
          <p className="mt-1 text-2xl font-semibold">{brl(won.reduce((s, q) => s + Number(q.total), 0))}</p>
        </div>
        <div className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <p className="text-xs text-prime-muted">Taxa de aprovação</p>
          <p className="mt-1 text-2xl font-semibold">{decided ? `${Math.round((won.length / decided) * 100)}%` : "—"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-xl border border-prime-border bg-white p-1 text-sm">
          {[
            ["abertos", "Em aberto"],
            ["aprovado", "Aprovados"],
            ["recusado", "Recusados"],
            ["expirado", "Vencidos"],
            ["todos", "Todos"]
          ].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-lg px-3 py-1 ${filter === id ? "bg-[#111] text-[#fff]" : "text-prime-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary ml-auto" onClick={() => setOpenId("novo")}>
          + Novo orçamento
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-prime-border bg-white p-8 text-center text-sm text-prime-muted">Nenhum orçamento aqui.</p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((q) => (
            <li key={q.id}>
              <button type="button" onClick={() => setOpenId(q.id)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-prime-border bg-white p-4 text-left shadow-prime-card hover:border-prime-gold">
                <span className="min-w-0">
                  <span className="block text-xs text-prime-muted">
                    {formatQuoteNumber(q.number)} · {new Date(q.created_at).toLocaleDateString("pt-BR")}
                    {q.valid_until ? ` · válido até ${q.valid_until.split("-").reverse().join("/")}` : ""}
                  </span>
                  <span className="block truncate font-semibold">{q.client_name ?? q.contact_name ?? "Cliente"}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${QUOTE_STATUS[q.st]?.cls ?? ""}`}>{QUOTE_STATUS[q.st]?.label ?? q.st}</span>
                  <span className="text-lg font-semibold">{brl(Number(q.total))}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuoteEditor({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: (id: string) => void }) {
  const router = useRouter();
  const { company } = useCompany();
  const [loaded, setLoaded] = useState(!id);
  const [status, setStatus] = useState("rascunho");
  const [number, setNumber] = useState<number | null>(null);
  const [tripsCount, setTripsCount] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [contact, setContact] = useState({ type: "PJ" as "PF" | "PJ", name: "", document: "", phone: "", email: "" });
  const [issuer, setIssuer] = useState<string>(company === "todas" ? "rj_prime" : company);
  const [validUntil, setValidUntil] = useState(plusDays(today(), 7));
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS);
  const [items, setItems] = useState<Item[]>([EMPTY_ITEM()]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mailOpen, setMailOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const [c, k] = await Promise.all([api<Client[]>("/api/clients"), api<Category[]>("/api/vehicle-categories")]);
      if (c.ok) setClients(c.data ?? []);
      if (k.ok) setCats((k.data ?? []).filter((x) => x.active !== false));
    })();
  }, []);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const r = await api<Record<string, unknown> & { items: Record<string, unknown>[]; trips: unknown[] }>(`/api/quotes/${id}`);
      if (!r.ok || !r.data) return;
      const q = r.data;
      setStatus(String(q.status));
      setNumber(Number(q.number));
      setTripsCount(q.trips?.length ?? 0);
      setClientId((q.client_id as string) ?? "");
      setContact({
        type: (q.contact_type as "PF" | "PJ") ?? "PJ",
        name: (q.contact_name as string) ?? "",
        document: (q.contact_document as string) ?? "",
        phone: (q.contact_phone as string) ?? "",
        email: (q.contact_email as string) ?? ""
      });
      setIssuer((q.issuer as string) ?? "rj_prime");
      setValidUntil((q.valid_until as string) ?? "");
      setDiscount(Number(q.discount) ? money2(Number(q.discount)) : "");
      setNotes((q.notes as string) ?? "");
      setConditions((q.conditions as string) ?? "");
      setItems(
        q.items.map((it) => {
          const at = it.scheduled_at ? new Date(String(it.scheduled_at)) : null;
          const mode = String(it.service_mode ?? "transfer");
          const h = itemHours(mode, it.hours == null ? null : Number(it.hours));
          const parts = at
            ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at)
            : [];
          const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
          return {
            vehicle_category_id: (it.vehicle_category_id as string) ?? "",
            service_mode: isDiaria(mode) ? "diaria" : mode,
            hours: h ? String(h) : "",
            description: (it.description as string) ?? "",
            date: at ? `${g("year")}-${g("month")}-${g("day")}` : ((it.service_date as string) ?? ""),
            time: at ? `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}` : "",
            origin: { text: (it.origin_text as string) ?? "", lat: (it.origin_lat as number) ?? null, lng: (it.origin_lng as number) ?? null },
            dest: { text: (it.destination_text as string) ?? "", lat: (it.destination_lat as number) ?? null, lng: (it.destination_lng as number) ?? null },
            passenger_count: Number(it.passenger_count) || 1,
            passenger_name: (it.passenger_name as string) ?? "",
            quantity: Number(it.quantity) || 1,
            unit_price: money2(Number(it.unit_price)),
            driver_amount: it.driver_amount == null ? "" : money2(Number(it.driver_amount))
          };
        })
      );
      setLoaded(true);
    })();
  }, [id]);

  useEffect(() => {
    setPrices([]);
    if (!clientId) return;
    void (async () => {
      const r = await api<PriceRow[]>(`/api/clients/${clientId}/category-prices`);
      if (r.ok) setPrices(r.data ?? []);
    })();
    const c = clients.find((x) => x.id === clientId);
    if (c?.billing_issuer && !id) setIssuer(c.billing_issuer);
  }, [clientId, clients, id]);

  const locked = status === "aprovado";
  const parsedItems = items.map((i) => ({ quantity: i.quantity, unit_price: toNum(i.unit_price), driver_amount: i.driver_amount ? toNum(i.driver_amount) : null }));
  const totals = quoteTotals(parsedItems, toNum(discount));

  function setItem(idx: number, patch: Partial<Item>) {
    setItems((list) =>
      list.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        // Puxa o preço da tabela do cliente quando muda categoria ou serviço e o valor está vazio.
        if ((patch.vehicle_category_id !== undefined || patch.service_mode !== undefined || patch.hours !== undefined) && next.vehicle_category_id) {
          const key = priceKeyFor(next.service_mode, next.hours ? toNum(next.hours) : null);
          const cell = prices.find((p) => p.category_id === next.vehicle_category_id && p.service === key && p.enabled);
          if (cell?.client_price != null && !it.unit_price) next.unit_price = money2(cell.client_price);
          if (cell?.partner_price != null && !it.driver_amount) next.driver_amount = money2(cell.partner_price);
        }
        return next;
      })
    );
  }

  function payload() {
    return {
      client_id: clientId || null,
      contact_type: contact.type,
      contact_name: contact.name || null,
      contact_document: contact.document || null,
      contact_phone: contact.phone || null,
      contact_email: contact.email || null,
      issuer: issuer || null,
      valid_until: validUntil || null,
      discount: toNum(discount),
      notes: notes || null,
      conditions: conditions || null,
      // Salva em ordem cronológica (orçamentos de vários dias ficam organizados no PDF).
      items: sortedItems(items).map((i) => ({
        vehicle_category_id: i.vehicle_category_id || null,
        service_mode: i.service_mode,
        hours: isDiaria(i.service_mode) && i.hours ? toNum(i.hours) : null,
        description: i.description || null,
        service_date: i.date || null,
        scheduled_at: i.date && i.time ? saoPauloDateAndTimeToUtcIso(i.date, i.time) : null,
        origin_text: i.origin.text || null,
        origin_lat: i.origin.lat,
        origin_lng: i.origin.lng,
        destination_text: i.dest.text || null,
        destination_lat: i.dest.lat,
        destination_lng: i.dest.lng,
        passenger_count: i.passenger_count,
        passenger_name: i.passenger_name || null,
        quantity: i.quantity,
        unit_price: toNum(i.unit_price),
        driver_amount: i.driver_amount ? toNum(i.driver_amount) : null
      }))
    };
  }

  async function save(): Promise<string | null> {
    if (!clientId && contact.name.trim().length < 2) {
      setMsg({ ok: false, text: "Escolha o cliente ou preencha o nome do contato." });
      return null;
    }
    setBusy(true);
    setMsg(null);
    const r = id
      ? await api<{ id: string }>(`/api/quotes/${id}`, { method: "PUT", body: JSON.stringify(payload()) })
      : await api<{ id: string }>("/api/quotes", { method: "POST", body: JSON.stringify(payload()) });
    setBusy(false);
    if (!r.ok || !r.data) {
      setMsg({ ok: false, text: r.error ?? "Não foi possível salvar." });
      return null;
    }
    setItems((l) => sortedItems(l));
    setMsg({ ok: true, text: "Orçamento salvo." });
    if (!id) onSaved(r.data.id);
    return r.data.id;
  }

  async function setQuoteStatus(s: string, reason?: string) {
    if (!id) return;
    setBusy(true);
    const r = await api(`/api/quotes/${id}/status`, { method: "POST", body: JSON.stringify({ status: s, reason }) });
    setBusy(false);
    if (r.ok) {
      setStatus(s);
      setMsg({ ok: true, text: s === "enviado" ? "Marcado como enviado." : s === "recusado" ? "Marcado como recusado." : "Atualizado." });
    } else setMsg({ ok: false, text: r.error ?? "Falhou." });
  }

  async function approve() {
    const missing = itemsMissingForTrips(
      items.map((i) => ({
        quantity: i.quantity,
        unit_price: toNum(i.unit_price),
        service_mode: i.service_mode,
        hours: i.hours ? toNum(i.hours) : null,
        scheduled_at: i.date && i.time ? "ok" : null,
        origin_text: i.origin.text,
        destination_text: i.dest.text
      }))
    );
    if (missing.length) {
      setMsg({ ok: false, text: `Antes de aprovar, complete: ${missing.map((m) => `serviço ${m.index + 1} (falta ${m.missing.join(", ")})`).join("; ")}.` });
      return;
    }
    const saved = await save();
    if (!saved) return;
    if (!window.confirm(`O cliente aprovou? Vão entrar ${totals.trips} corrida(s) na agenda, confirmadas, para você definir os motoristas.`)) return;
    setBusy(true);
    const r = await api<{ trips: number }>(`/api/quotes/${saved}/approve`, { method: "POST" });
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error ?? "Não foi possível aprovar." });
      return;
    }
    setStatus("aprovado");
    setTripsCount(r.data?.trips ?? 0);
    setMsg({ ok: true, text: `Aprovado! ${r.data?.trips ?? 0} corrida(s) já estão na Agenda.` });
  }

  if (!loaded) return <div className="h-40 animate-pulse rounded-2xl border border-prime-border bg-white" />;

  const catAllowsKm = (cid: string) => cats.find((c) => c.id === cid)?.allows_km;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton fallbackHref="/orcamentos" onClick={onClose} />
        <div className="flex items-center gap-2">
          {number ? <span className="text-sm text-prime-muted">{formatQuoteNumber(number)}</span> : null}
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${QUOTE_STATUS[status]?.cls ?? ""}`}>{QUOTE_STATUS[status]?.label}</span>
        </div>
      </div>

      {locked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
          <span>Aprovado. {tripsCount} corrida(s) estão na Agenda. Defina os motoristas até 3 dias antes.</span>
          <button type="button" className="btn-primary" onClick={() => router.push("/agenda?grupo=agendada&periodo=mes" as Route)}>
            Ver na Agenda
          </button>
        </div>
      ) : null}

      <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card sm:grid-cols-4">
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span>Cliente cadastrado</span>
          <select className={input} value={clientId} disabled={locked} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Cliente novo (preencher abaixo) —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.trade_name || c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>Empresa que emite</span>
          <select className={input} value={issuer} disabled={locked} onChange={(e) => setIssuer(e.target.value)}>
            {COMPANY_SCOPES.filter((c) => c.id !== "todas").map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>Válido até</span>
          <input type="date" className={input} value={validUntil} disabled={locked} onChange={(e) => setValidUntil(e.target.value)} />
        </label>
        {!clientId ? (
          <>
            <div className="inline-flex w-fit rounded-lg border border-prime-border p-0.5 text-sm sm:col-span-4">
              {(["PJ", "PF"] as const).map((t) => (
                <button key={t} type="button" disabled={locked} onClick={() => setContact({ ...contact, type: t })} className={`rounded-md px-3 py-1 ${contact.type === t ? "bg-[#111] text-[#fff]" : "text-prime-muted"}`}>
                  {t === "PJ" ? "Empresa" : "Pessoa física (noiva, turismo…)"}
                </button>
              ))}
            </div>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>Nome *</span>
              <input className={input} disabled={locked} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{contact.type === "PJ" ? "CNPJ" : "CPF"}</span>
              <input className={input} disabled={locked} value={contact.document} onChange={(e) => setContact({ ...contact, document: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>WhatsApp</span>
              <input className={input} disabled={locked} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>E-mail</span>
              <input className={input} disabled={locked} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </label>
            <p className="self-end text-xs text-prime-muted sm:col-span-2">Ao aprovar, o cliente é cadastrado sozinho.</p>
          </>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="font-semibold">Serviços</h3>
          <span className="text-xs text-prime-muted">Ao salvar, os serviços ficam em ordem de data e hora.</span>
        </div>
        {items.map((it, idx) => {
          const diaria = isDiaria(it.service_mode);
          const label = serviceLabelForClient(it.service_mode, it.hours ? toNum(it.hours) : null);
          const catName = cats.find((c) => c.id === it.vehicle_category_id)?.name;
          return (
            <div key={idx} className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card sm:grid-cols-6">
              <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-6">
                <span className="text-sm font-semibold">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#111] text-xs text-prime-gold">{idx + 1}</span>
                  {[catName, label, it.date ? it.date.split("-").reverse().slice(0, 2).join("/") : null, it.time || null].filter(Boolean).join(" · ") || "Novo serviço"}
                </span>
                {!locked ? (
                  <span className="flex flex-wrap gap-3 text-xs">
                    {!diaria ? (
                      <button type="button" className="text-prime-gold hover:underline" onClick={() => setItems((l) => [...l.slice(0, idx + 1), { ...it, origin: it.dest, dest: it.origin, time: "" }, ...l.slice(idx + 1)])}>
                        + Volta
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-prime-gold hover:underline"
                      onClick={() => setItems((l) => [...l.slice(0, idx + 1), { ...it, date: it.date ? plusDays(it.date, 1) : "" }, ...l.slice(idx + 1)])}
                    >
                      Repetir no dia seguinte
                    </button>
                    <button type="button" className="text-prime-gold hover:underline" onClick={() => setItems((l) => [...l.slice(0, idx + 1), { ...it }, ...l.slice(idx + 1)])}>
                      Duplicar
                    </button>
                    {items.length > 1 ? (
                      <button type="button" className="text-red-700 hover:underline" onClick={() => setItems((l) => l.filter((_, i) => i !== idx))}>
                        Remover
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </div>

              <label className="grid gap-1 text-sm sm:col-span-2">
                <span>Veículo</span>
                <select className={input} disabled={locked} value={it.vehicle_category_id} onChange={(e) => setItem(idx, { vehicle_category_id: e.target.value })}>
                  <option value="">Escolha…</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (até {c.passengers})
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-1 text-sm sm:col-span-2">
                <span>Tipo de serviço</span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { id: "transfer", label: "Transfer" },
                    { id: "diaria", label: "Diária / à disposição" },
                    ...(catAllowsKm(it.vehicle_category_id) ? [{ id: "km", label: "Por km" }] : []),
                    { id: "outro", label: "Outro" }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={locked}
                      onClick={() => setItem(idx, { service_mode: m.id, ...(m.id === "diaria" && !it.hours ? { hours: "12" } : {}) })}
                      className={`rounded-lg px-3 py-2 text-sm ring-1 ${it.service_mode === m.id ? "bg-[#111] text-[#fff] ring-[#111]" : "bg-white ring-prime-border hover:ring-prime-gold"}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="grid gap-1 text-sm">
                <span>Data</span>
                <input type="date" className={`${input} ${!it.date && !locked ? "ring-1 ring-amber-300" : ""}`} disabled={locked} value={it.date} onChange={(e) => setItem(idx, { date: e.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{diaria ? "Início" : "Hora"}</span>
                <input type="time" step={300} className={`${input} ${!it.time && !locked ? "ring-1 ring-amber-300" : ""}`} disabled={locked} value={it.time} onChange={(e) => setItem(idx, { time: e.target.value })} />
              </label>

              {diaria ? (
                <>
                  <div className="grid gap-1 text-sm sm:col-span-6">
                    <span>Quantas horas à disposição</span>
                    <div className="flex flex-wrap items-center gap-1">
                      {HOUR_CHIPS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          disabled={locked}
                          onClick={() => setItem(idx, { hours: String(h) })}
                          className={`min-w-[3rem] rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${toNum(it.hours) === h ? "bg-prime-gold text-[#111] ring-prime-gold" : "bg-white ring-prime-border hover:ring-prime-gold"}`}
                        >
                          {h}h
                        </button>
                      ))}
                      <input
                        className={`${input} w-24`}
                        inputMode="decimal"
                        disabled={locked}
                        placeholder="Outra"
                        value={HOUR_CHIPS.includes(toNum(it.hours)) ? "" : it.hours}
                        onChange={(e) => setItem(idx, { hours: e.target.value.replace(/[^0-9.,]/g, "") })}
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-3">
                    <AddressAutocompleteInput
                      label="Local de início (cidade ou endereço)"
                      value={it.origin.text}
                      hasCoords={it.origin.lat != null}
                      onChange={(t) => setItem(idx, { origin: { text: t, lat: null, lng: null } })}
                      onPlaceSelect={(p) => setItem(idx, { origin: { text: p.displayName, lat: p.lat, lng: p.lng } })}
                      onCoordsClear={() => setItem(idx, { origin: { ...it.origin, lat: null, lng: null } })}
                      devFallbackRole="admin"
                    />
                  </div>
                  <label className="grid gap-1 text-sm sm:col-span-3">
                    <span>Roteiro / região (opcional)</span>
                    <input
                      className={input}
                      disabled={locked}
                      placeholder="Ex.: Vitória e Vila Velha, roteiro a definir"
                      value={it.dest.text}
                      onChange={(e) => setItem(idx, { dest: { text: e.target.value, lat: null, lng: null } })}
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="sm:col-span-3">
                    <AddressAutocompleteInput
                      label="Embarque"
                      value={it.origin.text}
                      hasCoords={it.origin.lat != null}
                      onChange={(t) => setItem(idx, { origin: { text: t, lat: null, lng: null } })}
                      onPlaceSelect={(p) => setItem(idx, { origin: { text: p.displayName, lat: p.lat, lng: p.lng } })}
                      onCoordsClear={() => setItem(idx, { origin: { ...it.origin, lat: null, lng: null } })}
                      devFallbackRole="admin"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <AddressAutocompleteInput
                      label="Destino"
                      value={it.dest.text}
                      hasCoords={it.dest.lat != null}
                      onChange={(t) => setItem(idx, { dest: { text: t, lat: null, lng: null } })}
                      onPlaceSelect={(p) => setItem(idx, { dest: { text: p.displayName, lat: p.lat, lng: p.lng } })}
                      onCoordsClear={() => setItem(idx, { dest: { ...it.dest, lat: null, lng: null } })}
                      devFallbackRole="admin"
                    />
                  </div>
                </>
              )}

              <label className="grid gap-1 text-sm sm:col-span-2">
                <span>Passageiro / responsável</span>
                <input className={input} disabled={locked} value={it.passenger_name} onChange={(e) => setItem(idx, { passenger_name: e.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Pessoas</span>
                <input type="number" min={1} className={input} disabled={locked} value={it.passenger_count} onChange={(e) => setItem(idx, { passenger_count: Math.max(1, Number(e.target.value) || 1) })} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Qtd. de veículos</span>
                <input type="number" min={1} max={50} className={input} disabled={locked} value={it.quantity} onChange={(e) => setItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Valor por veículo (R$)</span>
                <input className={input} inputMode="decimal" disabled={locked} placeholder="0,00" value={it.unit_price} onChange={(e) => setItem(idx, { unit_price: e.target.value.replace(/[^0-9.,]/g, "") })} onBlur={(e) => setItem(idx, { unit_price: e.target.value ? money2(toNum(e.target.value)) : "" })} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Motorista recebe (R$)</span>
                <input className={`${input} bg-prime-bg`} inputMode="decimal" disabled={locked} placeholder="0,00" value={it.driver_amount} onChange={(e) => setItem(idx, { driver_amount: e.target.value.replace(/[^0-9.,]/g, "") })} onBlur={(e) => setItem(idx, { driver_amount: e.target.value ? money2(toNum(e.target.value)) : "" })} />
                <span className="text-[11px] text-prime-muted">Interno: não aparece para o cliente</span>
              </label>
              <label className="grid gap-1 text-sm sm:col-span-6">
                <span>Detalhe que aparece no orçamento (opcional)</span>
                <input className={input} disabled={locked} placeholder="Ex.: recepção com placa no desembarque · voo G3 1234" value={it.description} onChange={(e) => setItem(idx, { description: e.target.value })} />
              </label>
              <p className="text-xs text-prime-muted sm:col-span-6">
                {it.date ? (it.time ? formatBrDateTime(saoPauloDateAndTimeToUtcIso(it.date, it.time) ?? "") : `${it.date.split("-").reverse().join("/")} · falta a hora`) : "Falta a data"} · subtotal{" "}
                <strong className="text-prime-text">{brl(it.quantity * toNum(it.unit_price))}</strong>
              </p>
            </div>
          );
        })}
        {!locked ? (
          <button type="button" className="w-full rounded-2xl border-2 border-dashed border-prime-border p-3 text-sm font-semibold text-prime-gold hover:border-prime-gold" onClick={() => setItems((l) => [...l, { ...EMPTY_ITEM(), date: l[l.length - 1]?.date ?? "" }])}>
            + Adicionar serviço
          </button>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <label className="grid gap-1 text-sm">
            <span>Observações para o cliente</span>
            <textarea className={input} rows={2} disabled={locked} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Condições</span>
            <textarea className={input} rows={3} disabled={locked} value={conditions} onChange={(e) => setConditions(e.target.value)} />
          </label>
        </div>
        <div className="space-y-2 rounded-2xl border border-[#111] bg-[#111] p-4 text-sm text-[#fff]">
          <div className="flex justify-between">
            <span>Subtotal ({totals.trips} veículo(s))</span>
            <span>{brl(totals.subtotal)}</span>
          </div>
          <label className="flex items-center justify-between gap-2">
            <span>Desconto (R$)</span>
            <input className="w-28 rounded-lg bg-[#222] px-2 py-1 text-right text-[#fff]" inputMode="decimal" disabled={locked} value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.,]/g, ""))} />
          </label>
          <div className="flex justify-between border-t border-white/20 pt-2 text-lg font-semibold">
            <span className="text-prime-gold">Total</span>
            <span>{brl(totals.total)}</span>
          </div>
          <div className="flex justify-between text-xs text-[#bbb]">
            <span>Custo motoristas (interno)</span>
            <span>{brl(totals.cost)}</span>
          </div>
          <div className="flex justify-between text-xs text-[#bbb]">
            <span>Margem</span>
            <span>
              {brl(totals.margin)}
              {totals.total > 0 ? ` (${Math.round((totals.margin / totals.total) * 100)}%)` : ""}
            </span>
          </div>
        </div>
      </section>

      {/* Barra de ações sempre visível no rodapé: não precisa rolar para aprovar. */}
      <div className="sticky bottom-0 z-30 -mx-4 border-t border-prime-border bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] backdrop-blur lg:-mx-8 lg:px-8">
        {msg ? <p className={`mb-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm">
            Total <strong className="text-lg">{brl(totals.total)}</strong>
            <span className="ml-2 text-xs text-prime-muted">margem {totals.total > 0 ? `${Math.round((totals.margin / totals.total) * 100)}%` : "—"}</span>
          </span>
          {!locked ? (
            <>
              <button type="button" disabled={busy} className="btn-primary disabled:opacity-50" onClick={() => void save()}>
                {busy ? "Salvando…" : "Salvar"}
              </button>
              {id ? (
                <>
                  <a href={`/orcamento/${id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold ring-1 ring-prime-border hover:ring-prime-gold">
                    PDF
                  </a>
                  <button type="button" disabled={busy} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold ring-1 ring-prime-border hover:ring-prime-gold" onClick={() => setMailOpen(true)}>
                    ✉ Enviar por e-mail
                  </button>
                  {status !== "enviado" ? (
                    <button type="button" disabled={busy} className="rounded-lg bg-white px-4 py-2 text-sm ring-1 ring-prime-border hover:ring-prime-gold" onClick={() => void setQuoteStatus("enviado")}>
                      Marcar como enviado
                    </button>
                  ) : null}
                  <button type="button" disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-emerald-700" onClick={() => void approve()}>
                    ✓ Cliente aprovou
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg px-4 py-2 text-sm text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                    onClick={() => {
                      const reason = window.prompt("Motivo da recusa (preço, data, fechou com outro…):");
                      if (reason !== null) void setQuoteStatus("recusado", reason);
                    }}
                  >
                    Recusado
                  </button>
                </>
              ) : (
                <span className="text-xs text-prime-muted">Salve para gerar o PDF, enviar e aprovar.</span>
              )}
            </>
          ) : (
            <a href={`/orcamento/${id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold ring-1 ring-prime-border">
              Abrir PDF
            </a>
          )}
        </div>
      </div>

      {mailOpen && id ? (
        <QuoteMailDialog
          quoteId={id}
          defaultTo={contact.email || clients.find((c) => c.id === clientId)?.email || ""}
          clientName={contact.name || clients.find((c) => c.id === clientId)?.trade_name || clients.find((c) => c.id === clientId)?.name || ""}
          onClose={() => setMailOpen(false)}
          beforeSend={save}
          onSent={(to) => {
            setMailOpen(false);
            setStatus("enviado");
            setMsg({ ok: true, text: `Orçamento enviado para ${to}.` });
          }}
        />
      ) : null}
    </div>
  );
}

/** Envio do orçamento por e-mail com link para o cliente ver e imprimir (sem precisar de login). */
function QuoteMailDialog({
  quoteId,
  defaultTo,
  clientName,
  onClose,
  beforeSend,
  onSent
}: {
  quoteId: string;
  defaultTo: string;
  clientName: string;
  onClose: () => void;
  beforeSend: () => Promise<string | null>;
  onSent: (to: string) => void;
}) {
  const first = clientName.trim().split(/\s+/)[0] ?? "";
  const [to, setTo] = useState(defaultTo);
  const [text, setText] = useState(
    `Olá${first ? `, ${first}` : ""}!\n\nSegue o orçamento da Prime Vitória conforme conversamos. Qualquer ajuste, é só responder este e-mail ou chamar no WhatsApp.\n\nFicamos à disposição.`
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; mailto?: string } | null>(null);

  async function send() {
    setBusy(true);
    setErr(null);
    const saved = await beforeSend();
    if (!saved) {
      setBusy(false);
      setErr({ text: "Não foi possível salvar o orçamento antes de enviar." });
      return;
    }
    const r = await api<{ sent: boolean; link: string; subject: string; reason?: string }>(`/api/quotes/${quoteId}/send`, {
      method: "POST",
      body: JSON.stringify({ to, message: text })
    });
    setBusy(false);
    if (r.ok && r.data?.sent) {
      onSent(to);
      return;
    }
    const link = r.data?.link;
    setErr({
      text: r.error ?? r.data?.reason ?? "O envio automático falhou.",
      mailto: link ? `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(r.data?.subject ?? "Orçamento Prime Vitória")}&body=${encodeURIComponent(`${text}\n\nVer orçamento: ${link}`)}` : undefined
    });
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+(\s*[,;]\s*[^\s@]+@[^\s@]+\.[^\s@]+)*$/.test(to.trim());

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-semibold">Enviar orçamento por e-mail</h3>
        <label className="grid gap-1 text-sm">
          <span>Para (separe vários com vírgula)</span>
          <input className={input} type="email" multiple value={to} onChange={(e) => setTo(e.target.value)} placeholder="cliente@empresa.com.br" />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Mensagem</span>
          <textarea className={input} rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <p className="text-xs text-prime-muted">O cliente recebe a mensagem, o resumo dos serviços e um botão para abrir o orçamento completo e salvar em PDF.</p>
        {err ? (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {err.text}
            {err.mailto ? (
              <a href={err.mailto} className="mt-2 block font-semibold text-prime-text underline">
                Abrir no meu e-mail com o link pronto
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" disabled={!valid || busy} className="btn-primary disabled:opacity-50" onClick={() => void send()}>
            {busy ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
