"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { BackButton } from "@/components/back-button";
import { QUOTE_STATUS, effectiveQuoteStatus, formatQuoteNumber, quoteTotals } from "@/lib/quotes/quote-calc";
import { COMPANY_SCOPES, inCompany, useCompany } from "@/lib/company/company-context";
import { SERVICE_MODE_LABEL } from "@/lib/pricing/category-catalog";
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
type Client = { id: string; name: string; trade_name?: string | null; type: string; billing_issuer?: string | null };
type PriceRow = { category_id: string; service: string; enabled: boolean; client_price: number | null; partner_price: number | null };
type Item = {
  vehicle_category_id: string;
  service_mode: string;
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
          const parts = at
            ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at)
            : [];
          const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
          return {
            vehicle_category_id: (it.vehicle_category_id as string) ?? "",
            service_mode: (it.service_mode as string) ?? "transfer",
            description: (it.description as string) ?? "",
            date: at ? `${g("year")}-${g("month")}-${g("day")}` : "",
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
        if ((patch.vehicle_category_id !== undefined || patch.service_mode !== undefined) && next.vehicle_category_id) {
          const cell = prices.find((p) => p.category_id === next.vehicle_category_id && p.service === next.service_mode && p.enabled);
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
      items: items.map((i) => ({
        vehicle_category_id: i.vehicle_category_id || null,
        service_mode: i.service_mode,
        description: i.description || null,
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
        <h3 className="font-semibold">Serviços</h3>
        {items.map((it, idx) => (
          <div key={idx} className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card sm:grid-cols-6">
            <div className="flex items-center justify-between sm:col-span-6">
              <span className="text-sm font-semibold text-prime-gold">Item {idx + 1}</span>
              {!locked ? (
                <span className="flex gap-3 text-xs">
                  <button
                    type="button"
                    className="text-prime-gold hover:underline"
                    onClick={() => setItems((l) => [...l.slice(0, idx + 1), { ...it, origin: it.dest, dest: it.origin, time: "" }, ...l.slice(idx + 1)])}
                  >
                    + Volta (inverte o trajeto)
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
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>Serviço</span>
              <select className={input} disabled={locked} value={it.service_mode} onChange={(e) => setItem(idx, { service_mode: e.target.value })}>
                {(["transfer", "diaria_5h", "diaria_10h", "diaria_12h", "km", "outro"] as const)
                  .filter((m) => m !== "km" || catAllowsKm(it.vehicle_category_id))
                  .map((m) => (
                    <option key={m} value={m}>
                      {m === "outro" ? "Outro (descrever)" : SERVICE_MODE_LABEL[m]}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>Data</span>
              <input type="date" className={input} disabled={locked} value={it.date} onChange={(e) => setItem(idx, { date: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Hora</span>
              <input type="time" step={300} className={input} disabled={locked} value={it.time} onChange={(e) => setItem(idx, { time: e.target.value })} />
            </label>
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
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>Passageiro / responsável</span>
              <input className={input} disabled={locked} value={it.passenger_name} onChange={(e) => setItem(idx, { passenger_name: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Pessoas</span>
              <input type="number" min={1} className={input} disabled={locked} value={it.passenger_count} onChange={(e) => setItem(idx, { passenger_count: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Qtd. de carros</span>
              <input type="number" min={1} max={50} className={input} disabled={locked} value={it.quantity} onChange={(e) => setItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Valor por carro (R$)</span>
              <input className={input} inputMode="decimal" disabled={locked} placeholder="0,00" value={it.unit_price} onChange={(e) => setItem(idx, { unit_price: e.target.value.replace(/[^0-9.,]/g, "") })} onBlur={(e) => setItem(idx, { unit_price: e.target.value ? money2(toNum(e.target.value)) : "" })} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Motorista recebe (R$)</span>
              <input className={input} inputMode="decimal" disabled={locked} placeholder="0,00" value={it.driver_amount} onChange={(e) => setItem(idx, { driver_amount: e.target.value.replace(/[^0-9.,]/g, "") })} onBlur={(e) => setItem(idx, { driver_amount: e.target.value ? money2(toNum(e.target.value)) : "" })} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-6">
              <span>Descrição que aparece no orçamento</span>
              <input className={input} disabled={locked} placeholder="Ex.: Transfer aeroporto → hotel com placa de recepção" value={it.description} onChange={(e) => setItem(idx, { description: e.target.value })} />
            </label>
            {it.date && it.time ? (
              <p className="text-xs text-prime-muted sm:col-span-6">
                {formatBrDateTime(saoPauloDateAndTimeToUtcIso(it.date, it.time) ?? "")} · subtotal {brl(it.quantity * toNum(it.unit_price))}
              </p>
            ) : null}
          </div>
        ))}
        {!locked ? (
          <button type="button" className="w-full rounded-2xl border-2 border-dashed border-prime-border p-3 text-sm font-semibold text-prime-gold hover:border-prime-gold" onClick={() => setItems((l) => [...l, EMPTY_ITEM()])}>
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
            <span>Subtotal ({totals.trips} carro(s))</span>
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
            <span>Custo motoristas</span>
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

      {msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}

      {!locked ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className="btn-primary disabled:opacity-50" onClick={() => void save()}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
          {id ? (
            <>
              <a href={`/orcamento/${id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold ring-1 ring-prime-border hover:ring-prime-gold">
                Abrir PDF para enviar
              </a>
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
            <span className="self-center text-xs text-prime-muted">Salve para gerar o PDF e aprovar.</span>
          )}
        </div>
      ) : (
        <a href={`/orcamento/${id}`} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold ring-1 ring-prime-border">
          Abrir PDF
        </a>
      )}
    </div>
  );
}
