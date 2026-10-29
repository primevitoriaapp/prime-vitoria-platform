"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { VEHICLE_DOCS, docState, worstDocState, type DocState } from "@/lib/vehicles/vehicle-docs";

type VehicleRow = {
  id: string;
  model: string;
  plate: string;
  brand?: string | null;
  model_year?: number | null;
  category?: string | null;
  capacity?: number | null;
  color?: string | null;
  active: boolean;
  vehicle_category_id?: string | null;
  partner_id?: string | null;
  insurer?: string | null;
  insurance_expires_at?: string | null;
  licensing_expires_at?: string | null;
  inspection_expires_at?: string | null;
  notes?: string | null;
};
type Props = { initialVehicles: VehicleRow[] };
type Opt = { id: string; name: string };

const EMPTY = {
  brand: "",
  model: "",
  model_year: "",
  plate: "",
  color: "Preto",
  capacity: "",
  vehicle_category_id: "",
  partner_id: "",
  insurer: "",
  insurance_expires_at: "",
  licensing_expires_at: "",
  inspection_expires_at: "",
  notes: ""
};
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const BADGE: Record<DocState, { label: string; cls: string }> = {
  vencido: { label: "Documento vencido", cls: "bg-red-600 text-[#fff]" },
  vence_30: { label: "Vence em 30 dias", cls: "bg-amber-100 text-amber-900" },
  sem_data: { label: "Datas não informadas", cls: "bg-prime-bg text-prime-muted" },
  ok: { label: "Documentos em dia", cls: "bg-emerald-100 text-emerald-800" }
};
const br = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "—");

/** Frota: carros com categoria, dono (Prime ou parceiro) e vencimento de seguro, CRLV e vistoria. */
export function VehiclesFleetPanel({ initialVehicles }: Props) {
  const router = useRouter();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [cats, setCats] = useState<Opt[]>([]);
  const [partners, setPartners] = useState<Opt[]>([]);
  const [editing, setEditing] = useState<string | "novo" | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const t = today();

  const reload = useCallback(async () => {
    const res = await fetch("/api/vehicles", { credentials: "include" });
    const json = (await res.json()) as { success?: boolean; data?: VehicleRow[] };
    if (res.ok && json.success) setVehicles(json.data ?? []);
    router.refresh();
  }, [router]);

  useEffect(() => {
    void (async () => {
      const [c, p] = await Promise.all([
        fetch("/api/vehicle-categories", { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/partners", { credentials: "include" }).then((r) => r.json()).catch(() => ({}))
      ]);
      setCats(((c as { data?: { id: string; name: string; active?: boolean }[] }).data ?? []).filter((x) => x.active !== false));
      setPartners(((p as { data?: { id: string; name: string; trade_name?: string | null }[] }).data ?? []).map((x) => ({ id: x.id, name: x.trade_name || x.name })));
    })();
  }, []);

  function open(v?: VehicleRow) {
    setMsg(null);
    if (!v) {
      setForm({ ...EMPTY });
      setEditing("novo");
      return;
    }
    setForm({
      brand: v.brand ?? "",
      model: v.model,
      model_year: v.model_year ? String(v.model_year) : "",
      plate: v.plate,
      color: v.color ?? "",
      capacity: v.capacity != null ? String(v.capacity) : "",
      vehicle_category_id: v.vehicle_category_id ?? "",
      partner_id: v.partner_id ?? "",
      insurer: v.insurer ?? "",
      insurance_expires_at: v.insurance_expires_at ?? "",
      licensing_expires_at: v.licensing_expires_at ?? "",
      inspection_expires_at: v.inspection_expires_at ?? "",
      notes: v.notes ?? ""
    });
    setEditing(v.id);
  }

  async function save() {
    if (form.model.trim().length < 2 || form.plate.trim().length < 7) return setMsg({ ok: false, text: "Preencha modelo e placa (7 caracteres)." });
    setBusy(true);
    const cat = cats.find((c) => c.id === form.vehicle_category_id);
    const payload = {
      brand: form.brand.trim() || null,
      model: form.model.trim(),
      model_year: form.model_year ? Number(form.model_year) : null,
      plate: form.plate.trim().toUpperCase(),
      color: form.color.trim() || null,
      capacity: form.capacity ? Number(form.capacity) : null,
      vehicle_category_id: form.vehicle_category_id || null,
      category: cat?.name ?? null,
      partner_id: form.partner_id || null,
      insurer: form.insurer.trim() || null,
      insurance_expires_at: form.insurance_expires_at || null,
      licensing_expires_at: form.licensing_expires_at || null,
      inspection_expires_at: form.inspection_expires_at || null,
      notes: form.notes.trim() || null
    };
    const res = await fetch(editing === "novo" ? "/api/vehicles" : `/api/vehicles/${editing}`, {
      method: editing === "novo" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) return setMsg({ ok: false, text: json.error?.message ?? "Não foi possível salvar." });
    setMsg({ ok: true, text: editing === "novo" ? "Veículo cadastrado." : "Veículo atualizado." });
    setEditing(null);
    void reload();
  }

  async function deactivate(v: VehicleRow) {
    if (!window.confirm(`Tirar ${v.plate} da frota?`)) return;
    await fetch(`/api/vehicles/${v.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ active: false }) });
    void reload();
  }

  const list = useMemo(
    () =>
      vehicles
        .filter((v) => !q.trim() || [v.plate, v.model, v.brand, v.category].filter(Boolean).some((x) => String(x).toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => ["vencido", "vence_30", "sem_data", "ok"].indexOf(worstDocState(a, t)) - ["vencido", "vence_30", "sem_data", "ok"].indexOf(worstDocState(b, t))),
    [vehicles, q, t]
  );
  const alerts = vehicles.filter((v) => ["vencido", "vence_30"].includes(worstDocState(v, t))).length;

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${PRIME_INPUT_CLASS} max-w-xs`} placeholder="Buscar placa ou modelo" value={q} onChange={(e) => setQ(e.target.value)} />
        {alerts ? <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">{alerts} veículo(s) com documento vencido ou vencendo</span> : null}
        <button type="button" className="btn-primary ml-auto" onClick={() => open()}>
          + Novo veículo
        </button>
      </div>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}

      {editing ? (
        <section className="grid gap-3 rounded-2xl border-2 border-prime-gold/60 bg-white p-4 shadow-prime-card sm:grid-cols-4">
          <h2 className="font-semibold sm:col-span-4">{editing === "novo" ? "Novo veículo" : `Editar ${form.plate}`}</h2>
          <label className="grid gap-1 text-sm">
            <span>Marca</span>
            <input className={PRIME_INPUT_CLASS} value={form.brand} onChange={set("brand")} placeholder="Toyota" />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Modelo *</span>
            <input className={PRIME_INPUT_CLASS} value={form.model} onChange={set("model")} placeholder="Corolla Altis" />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Ano</span>
            <input className={PRIME_INPUT_CLASS} inputMode="numeric" value={form.model_year} onChange={set("model_year")} placeholder="2024" />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Placa *</span>
            <input className={`${PRIME_INPUT_CLASS} uppercase`} value={form.plate} onChange={set("plate")} placeholder="ABC1D23" />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Cor</span>
            <input className={PRIME_INPUT_CLASS} value={form.color} onChange={set("color")} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Categoria (como o cliente vê)</span>
            <select className={PRIME_INPUT_CLASS} value={form.vehicle_category_id} onChange={set("vehicle_category_id")}>
              <option value="">Escolha…</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Lugares</span>
            <input className={PRIME_INPUT_CLASS} inputMode="numeric" value={form.capacity} onChange={set("capacity")} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Dono do carro</span>
            <select className={PRIME_INPUT_CLASS} value={form.partner_id} onChange={set("partner_id")}>
              <option value="">Prime (frota própria)</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  Parceiro: {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Seguradora</span>
            <input className={PRIME_INPUT_CLASS} value={form.insurer} onChange={set("insurer")} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Seguro vence em</span>
            <input type="date" className={PRIME_INPUT_CLASS} value={form.insurance_expires_at} onChange={set("insurance_expires_at")} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Licenciamento (CRLV) vence</span>
            <input type="date" className={PRIME_INPUT_CLASS} value={form.licensing_expires_at} onChange={set("licensing_expires_at")} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Vistoria vence</span>
            <input type="date" className={PRIME_INPUT_CLASS} value={form.inspection_expires_at} onChange={set("inspection_expires_at")} />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-4">
            <span>Observações</span>
            <input className={PRIME_INPUT_CLASS} value={form.notes} onChange={set("notes")} placeholder="Ex.: blindado nível III-A, teto solar…" />
          </label>
          <div className="flex gap-2 sm:col-span-4">
            <button type="button" disabled={busy} className="btn-primary disabled:opacity-50" onClick={() => void save()}>
              {busy ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-prime-border bg-white p-8 text-center text-sm text-prime-muted">Nenhum veículo cadastrado.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => {
            const worst = worstDocState(v, t);
            return (
              <li key={v.id} className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{[v.brand, v.model, v.model_year].filter(Boolean).join(" ")}</p>
                    <p className="text-xs text-prime-muted">
                      {v.category ?? "Sem categoria"} · {v.color ?? "cor —"}
                      {v.capacity ? ` · ${v.capacity} lugares` : ""}
                    </p>
                    <p className="text-xs text-prime-muted">{v.partner_id ? `Parceiro: ${partners.find((p) => p.id === v.partner_id)?.name ?? "—"}` : "Frota própria"}</p>
                  </div>
                  <span className="shrink-0 rounded-lg border-2 border-[#111] px-2 py-1 font-mono text-sm font-bold">{v.plate}</span>
                </div>
                <span className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${BADGE[worst].cls}`}>{BADGE[worst].label}</span>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {VEHICLE_DOCS.map((d) => {
                    const st = docState(v[d.key], t);
                    return (
                      <li key={d.key} className="flex justify-between">
                        <span className="text-prime-muted">{d.label}</span>
                        <span className={st === "vencido" ? "font-semibold text-red-700" : st === "vence_30" ? "font-semibold text-amber-700" : ""}>{br(v[d.key])}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 flex gap-3 text-sm">
                  <button type="button" className="font-semibold text-prime-gold hover:underline" onClick={() => open(v)}>
                    Editar
                  </button>
                  <button type="button" className="text-red-700 hover:underline" onClick={() => void deactivate(v)}>
                    Tirar da frota
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
