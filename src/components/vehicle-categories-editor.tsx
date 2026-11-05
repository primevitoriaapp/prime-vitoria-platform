"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type Category = {
  id: string;
  name: string;
  description: string | null;
  passengers: number;
  kind: "carro" | "van" | "onibus";
  sort: number;
  active: boolean;
  photo_url: string | null;
  allows_km?: boolean;
};

const KIND_LABEL = { carro: "Carro", van: "Van", onibus: "Ônibus" } as const;

function CategoryCard({ c, onChanged }: { c: Category; onChanged: () => void }) {
  const [form, setForm] = useState(c);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setForm(c), [c]);

  async function save(patch: Partial<Category>) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/vehicle-categories/${c.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    setBusy(false);
    setMsg(res.ok ? "Salvo." : "Não foi possível salvar.");
    if (res.ok) onChanged();
  }

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/vehicle-categories/${c.id}/photo`, { method: "POST", credentials: "include", body: fd });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(false);
    setMsg(res.ok ? "Foto atualizada." : (json.error?.message ?? "Falha no envio da foto."));
    if (res.ok) onChanged();
  }

  const [editing, setEditing] = useState(false);

  return (
    <li className={`flex flex-col overflow-hidden rounded-2xl border border-prime-border bg-white shadow-prime-card ${c.active ? "" : "opacity-60"}`}>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="group relative flex h-48 items-center justify-center bg-gradient-to-b from-[#F7F6F2] to-[#ECEAE4]"
        title="Trocar foto"
      >
        {c.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo_url} alt={c.name} className="h-full w-full object-contain p-4" />
        ) : (
          <span className="text-sm text-prime-muted">+ Enviar foto do carro</span>
        )}
        <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-prime-text opacity-0 shadow transition group-hover:opacity-100">
          Trocar foto
        </span>
        {!c.active ? <span className="absolute left-3 top-3 rounded-full bg-[#111] px-2.5 py-1 text-xs font-semibold text-[#fff]">Desativada</span> : null}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <div className="flex flex-1 flex-col p-5">
        {!editing ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold tracking-tight text-prime-text">{c.name}</h3>
              <span className="shrink-0 rounded-full bg-prime-bg px-2.5 py-1 text-xs font-semibold text-[#4A4D55]">
                {KIND_LABEL[c.kind]} · {c.passengers} lugares
              </span>
            </div>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-prime-muted">{c.description || "Sem descrição. Toque em Editar para escrever o que o cliente vê."}</p>
            <p className="mt-3 text-xs text-prime-muted">{c.allows_km ? "Transfer, diárias e cobrança por km" : "Transfer e diárias"}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-prime-border pt-4">
              <button type="button" className="btn-outline" onClick={() => setEditing(true)}>
                Editar
              </button>
              <button type="button" disabled={busy} onClick={() => void save({ active: !c.active })} className="px-2 text-sm text-prime-muted hover:text-prime-text hover:underline">
                {c.active ? "Desativar" : "Reativar"}
              </button>
              {msg ? <span className="ml-auto text-sm text-prime-muted">{msg}</span> : null}
            </div>
          </>
        ) : (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Nome</span>
              <input className={PRIME_INPUT_CLASS} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Lugares</span>
                <input
                  type="number"
                  min={1}
                  max={80}
                  className={PRIME_INPUT_CLASS}
                  value={form.passengers}
                  onChange={(e) => setForm({ ...form, passengers: Number(e.target.value) || 1 })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Tipo</span>
                <select className={PRIME_INPUT_CLASS} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Category["kind"] })}>
                  {Object.entries(KIND_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Descrição (o cliente vê no pedido e no orçamento)</span>
              <textarea className={PRIME_INPUT_CLASS} rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(form.allows_km)} onChange={(e) => setForm({ ...form, allows_km: e.target.checked })} />
              Pode ser cobrada por km (bandeira 1 e 2)
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save({ name: form.name, passengers: form.passengers, kind: form.kind, description: form.description || null, allows_km: Boolean(form.allows_km) }).then(() =>
                    setEditing(false)
                  )
                }
                className="btn-primary disabled:opacity-50"
              >
                Salvar
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setForm(c);
                  setEditing(false);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/** Configurações → categorias de veículos (foto, lotação, descrição). */
export function VehicleCategoriesEditor() {
  const [items, setItems] = useState<Category[]>([]);
  const [adding, setAdding] = useState({ name: "", passengers: 4, kind: "carro" as Category["kind"] });

  const load = useCallback(async () => {
    const res = await fetch("/api/vehicle-categories", { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Category[] };
    if (res.ok && json.success) setItems(json.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (adding.name.trim().length < 2) return;
    const res = await fetch("/api/vehicle-categories", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...adding, sort: (items.at(-1)?.sort ?? 0) + 10 })
    });
    if (res.ok) {
      setAdding({ name: "", passengers: 4, kind: "carro" });
      void load();
    }
  }

  return (
    <section className="space-y-5">
      <p className="text-[15px] text-prime-muted">
        Toque na foto para trocar (PNG, JPG ou WEBP). Os preços de cada categoria ficam no cadastro de cada empresa, em <b>Veículos e preços</b>.
      </p>
      <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((c) => (
          <CategoryCard key={c.id} c={c} onChanged={() => void load()} />
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-prime-border bg-white p-5">
        <p className="w-full text-[15px] font-semibold text-prime-text">Nova categoria</p>
        <input
          className={`${PRIME_INPUT_CLASS} max-w-xs`}
          placeholder="Nova categoria (ex.: Blindado)"
          value={adding.name}
          onChange={(e) => setAdding({ ...adding, name: e.target.value })}
        />
        <input
          type="number"
          min={1}
          max={80}
          className={`${PRIME_INPUT_CLASS} w-24`}
          value={adding.passengers}
          onChange={(e) => setAdding({ ...adding, passengers: Number(e.target.value) || 1 })}
        />
        <select className={`${PRIME_INPUT_CLASS} w-32`} value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value as Category["kind"] })}>
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void add()} className="btn-outline">
          + Adicionar
        </button>
      </div>
    </section>
  );
}
