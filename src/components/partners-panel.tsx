"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { BackButton } from "@/components/back-button";

type Partner = {
  id: string;
  type: "PF" | "PJ";
  name: string;
  trade_name: string | null;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  pix_key: string | null;
  city: string | null;
  notes: string | null;
  active: boolean;
  vehicle_count?: number;
  driver_count?: number;
  vehicle_limit?: number | null;
};
type Vehicle = { id: string; plate: string; model: string; brand: string | null; color: string | null; model_year: number | null; vehicle_category_id: string | null };
type Driver = { id: string; full_name: string | null; cpf: string; whatsapp: string | null; phone: string | null };
type Detail = Partner & { vehicles: Vehicle[]; drivers: Driver[] };
type Category = { id: string; name: string };
type AnyDriver = { id: string; profile_name?: string | null; full_name?: string | null; cpf: string; partner_id?: string | null };

const input = PRIME_INPUT_CLASS;
const EMPTY = { type: "PJ" as "PF" | "PJ", name: "", trade_name: "", document: "", whatsapp: "", email: "", pix_key: "", city: "", notes: "" };

async function api<T>(url: string, init?: RequestInit) {
  const res = await fetchWithSupabaseSession(url, init ?? {}, "admin");
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: { message?: string } };
  return { ok: res.ok && Boolean(json.success), data: json.data, error: json.error?.message };
}

/** Parceiros: empresas (PJ) e pessoas (PF) que prestam serviço, com frota e motoristas. */
export function PartnersPanel() {
  const [list, setList] = useState<Partner[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const r = await api<Partner[]>("/api/partners");
    if (r.ok) setList(r.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (form.name.trim().length < 2) {
      setMsg({ ok: false, text: "Informe o nome." });
      return;
    }
    setBusy(true);
    const r = await api<Partner>("/api/partners", { method: "POST", body: JSON.stringify(form) });
    setBusy(false);
    if (!r.ok || !r.data) {
      setMsg({ ok: false, text: r.error ?? "Não foi possível salvar." });
      return;
    }
    setForm({ ...EMPTY });
    setCreating(false);
    setMsg({ ok: true, text: "Parceiro cadastrado. Agora inclua os carros e motoristas." });
    await load();
    setOpenId(r.data.id);
  }

  if (openId) {
    return (
      <PartnerDetail
        id={openId}
        onBack={() => {
          setOpenId(null);
          void load();
        }}
      />
    );
  }

  const visible = list.filter((p) => !q.trim() || [p.name, p.trade_name, p.document, p.city].filter(Boolean).some((v) => String(v).toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className={`${input} max-w-sm flex-1`} placeholder="Buscar parceiro, CNPJ/CPF ou cidade" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn-primary ml-auto" onClick={() => setCreating((v) => !v)}>
          {creating ? "Fechar" : "+ Novo parceiro"}
        </button>
      </div>

      {creating ? (
        <div className="grid gap-3 rounded-2xl border-2 border-prime-gold/60 bg-white p-4 shadow-prime-card sm:grid-cols-2">
          <div className="inline-flex w-fit rounded-xl border border-prime-border p-1 text-sm sm:col-span-2">
            {(["PJ", "PF"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setForm({ ...form, type: t })} className={`rounded-lg px-4 py-1.5 ${form.type === t ? "bg-[#111] text-[#fff]" : "text-prime-muted"}`}>
                {t === "PJ" ? "Empresa (CNPJ): carros sem limite" : "Pessoa física (CPF): até 2 carros"}
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-sm">
            <span>{form.type === "PJ" ? "Razão social" : "Nome completo"} *</span>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          {form.type === "PJ" ? (
            <label className="grid gap-1 text-sm">
              <span>Nome fantasia</span>
              <input className={input} value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} />
            </label>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span>{form.type === "PJ" ? "CNPJ" : "CPF"}</span>
            <input className={input} value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>WhatsApp</span>
            <input className={input} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>E-mail</span>
            <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Chave PIX (para pagamento)</span>
            <input className={input} value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Cidade</span>
            <input className={input} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <div className="sm:col-span-2">
            <button type="button" disabled={busy} className="btn-primary disabled:opacity-50" onClick={() => void create()}>
              {busy ? "Salvando…" : "Cadastrar parceiro"}
            </button>
          </div>
        </div>
      ) : null}

      {msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-prime-border bg-white p-8 text-center text-sm text-prime-muted">
          Nenhum parceiro ainda. Cadastre empresas como a Ilha Locadora ou motoristas com carro próprio.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <button key={p.id} type="button" onClick={() => setOpenId(p.id)} className="rounded-2xl border border-prime-border bg-white p-4 text-left shadow-prime-card hover:border-prime-gold">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#111] text-xs font-bold text-prime-gold">{p.type}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.trade_name || p.name}</span>
                    <span className="block truncate text-xs text-prime-muted">{[p.document, p.city].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                </div>
              </div>
              <div className="mt-4 flex gap-4 text-sm">
                <span>
                  <b>{p.vehicle_count ?? 0}</b>
                  {p.vehicle_limit ? `/${p.vehicle_limit}` : ""} carro(s)
                </span>
                <span>
                  <b>{p.driver_count ?? 0}</b> motorista(s)
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PartnerDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [allDrivers, setAllDrivers] = useState<AnyDriver[]>([]);
  const [veh, setVeh] = useState({ plate: "", model: "", brand: "", color: "", model_year: "", vehicle_category_id: "" });
  const [linkDriver, setLinkDriver] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Partner | null>(null);

  const load = useCallback(async () => {
    const [r, c, dr] = await Promise.all([api<Detail>(`/api/partners/${id}`), api<(Category & { active?: boolean })[]>("/api/vehicle-categories"), api<AnyDriver[]>("/api/drivers")]);
    if (r.ok && r.data) {
      setD(r.data);
      setEdit(r.data);
    }
    if (c.ok) setCats((c.data ?? []).filter((x) => x.active !== false));
    if (dr.ok) setAllDrivers(dr.data ?? []);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!d || !edit) return <div className="h-40 animate-pulse rounded-2xl border border-prime-border bg-white" />;

  const full = d.vehicle_limit != null && d.vehicles.length >= d.vehicle_limit;
  const catName = (cid: string | null) => cats.find((c) => c.id === cid)?.name ?? "—";
  const linkable = allDrivers.filter((x) => !x.partner_id && !d.drivers.some((y) => y.id === x.id));

  async function run(p: Promise<{ ok: boolean; error?: string }>, okText: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Falhou." });
    if (r.ok) void load();
    return r.ok;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton fallbackHref="/parceiros" onClick={onBack} />
        <button
          type="button"
          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          onClick={async () => {
            if (!window.confirm(`Excluir ${d.name}? Os carros e motoristas dele continuam cadastrados, só ficam sem parceiro.`)) return;
            const r = await api(`/api/partners/${id}`, { method: "DELETE" });
            if (r.ok) onBack();
            else setMsg({ ok: false, text: r.error ?? "Falhou." });
          }}
        >
          Excluir parceiro
        </button>
      </div>

      <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
        <h2 className="text-lg font-semibold">
          {d.trade_name || d.name} <span className="text-sm font-normal text-prime-muted">· {d.type === "PJ" ? "Empresa" : "Pessoa física"}</span>
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["name", d.type === "PJ" ? "Razão social" : "Nome"],
              ["trade_name", "Nome fantasia"],
              ["document", d.type === "PJ" ? "CNPJ" : "CPF"],
              ["whatsapp", "WhatsApp"],
              ["email", "E-mail"],
              ["pix_key", "Chave PIX"],
              ["city", "Cidade"]
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="grid gap-1 text-sm">
              <span>{label}</span>
              <input className={input} value={(edit[k] as string | null) ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
            </label>
          ))}
          <label className="grid gap-1 text-sm sm:col-span-3">
            <span>Observações</span>
            <input className={input} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          className="btn-primary mt-3 disabled:opacity-50"
          onClick={() =>
            void run(
              api(`/api/partners/${id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  type: edit.type,
                  name: edit.name,
                  trade_name: edit.trade_name,
                  document: edit.document,
                  whatsapp: edit.whatsapp,
                  email: edit.email ?? "",
                  pix_key: edit.pix_key,
                  city: edit.city,
                  notes: edit.notes
                })
              }),
              "Dados salvos."
            )
          }
        >
          Salvar dados
        </button>
      </section>

      {msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}

      <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Frota</h3>
          <span className="text-sm text-prime-muted">
            {d.vehicles.length}
            {d.vehicle_limit ? ` de ${d.vehicle_limit} (limite de pessoa física)` : " carro(s)"}
          </span>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {d.vehicles.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 rounded-xl bg-prime-bg p-3 text-sm">
              <span>
                <b className="font-mono">{v.plate}</b> · {[v.brand, v.model, v.color, v.model_year].filter(Boolean).join(" ")}
                <span className="block text-xs text-prime-muted">{catName(v.vehicle_category_id)}</span>
              </span>
              <button
                type="button"
                className="text-xs text-red-700 hover:underline"
                onClick={() => window.confirm(`Tirar ${v.plate} da frota?`) && void run(api(`/api/partners/${id}/vehicles?vehicle_id=${v.id}`, { method: "DELETE" }), "Carro removido.")}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
        {full ? (
          <p className="mt-3 text-sm text-amber-800">Limite de {d.vehicle_limit} carros para pessoa física atingido.</p>
        ) : (
          <div className="mt-4 grid gap-2 border-t border-prime-border pt-4 sm:grid-cols-6">
            <input className={input} placeholder="Placa" value={veh.plate} onChange={(e) => setVeh({ ...veh, plate: e.target.value })} />
            <input className={input} placeholder="Modelo" value={veh.model} onChange={(e) => setVeh({ ...veh, model: e.target.value })} />
            <input className={input} placeholder="Marca" value={veh.brand} onChange={(e) => setVeh({ ...veh, brand: e.target.value })} />
            <input className={input} placeholder="Cor" value={veh.color} onChange={(e) => setVeh({ ...veh, color: e.target.value })} />
            <input className={input} placeholder="Ano" inputMode="numeric" value={veh.model_year} onChange={(e) => setVeh({ ...veh, model_year: e.target.value })} />
            <select className={input} value={veh.vehicle_category_id} onChange={(e) => setVeh({ ...veh, vehicle_category_id: e.target.value })}>
              <option value="">Categoria…</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="sm:col-span-6">
              <button
                type="button"
                disabled={busy}
                className="btn-primary disabled:opacity-50"
                onClick={async () => {
                  const ok = await run(
                    api(`/api/partners/${id}/vehicles`, {
                      method: "POST",
                      body: JSON.stringify({
                        plate: veh.plate,
                        model: veh.model,
                        brand: veh.brand || null,
                        color: veh.color || null,
                        model_year: veh.model_year ? Number(veh.model_year) : null,
                        vehicle_category_id: veh.vehicle_category_id || null
                      })
                    }),
                    "Carro incluído na frota."
                  );
                  if (ok) setVeh({ plate: "", model: "", brand: "", color: "", model_year: "", vehicle_category_id: "" });
                }}
              >
                + Incluir carro
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
        <h3 className="font-semibold">Motoristas deste parceiro</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {d.drivers.length === 0 ? <li className="text-sm text-prime-muted">Nenhum ainda.</li> : null}
          {d.drivers.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 rounded-xl bg-prime-bg p-3 text-sm">
              <span>
                <b>{x.full_name ?? "Motorista"}</b>
                <span className="block text-xs text-prime-muted">CPF {x.cpf}{x.whatsapp ? ` · ${x.whatsapp}` : ""}</span>
              </span>
              <button
                type="button"
                className="text-xs text-red-700 hover:underline"
                onClick={() => void run(api(`/api/partners/${id}/drivers?driver_id=${x.id}`, { method: "DELETE" }), "Motorista desvinculado.")}
              >
                Desvincular
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-prime-border pt-4">
          <select className={`${input} max-w-sm`} value={linkDriver} onChange={(e) => setLinkDriver(e.target.value)}>
            <option value="">Escolha um motorista já cadastrado…</option>
            {linkable.map((x) => (
              <option key={x.id} value={x.id}>
                {x.profile_name ?? x.full_name ?? "Motorista"} · CPF {x.cpf}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !linkDriver}
            className="btn-primary disabled:opacity-40"
            onClick={async () => {
              const ok = await run(api(`/api/partners/${id}/drivers`, { method: "POST", body: JSON.stringify({ driver_id: linkDriver }) }), "Motorista vinculado.");
              if (ok) setLinkDriver("");
            }}
          >
            Vincular
          </button>
          <Link href="/drivers" className="text-sm text-prime-gold hover:underline">
            Cadastrar motorista novo →
          </Link>
        </div>
      </section>
    </div>
  );
}
