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

  return (
    <li className={`rounded-xl border border-prime-border bg-white p-4 shadow-prime-card ${c.active ? "" : "opacity-60"}`}>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-prime-border bg-prime-bg text-xs text-prime-muted hover:border-prime-gold"
          title="Trocar foto"
        >
          {c.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.photo_url} alt={c.name} className="h-full w-full object-contain" />
          ) : (
            "+ Foto"
          )}
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
        <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_110px_120px]">
          <input className={PRIME_INPUT_CLASS} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome" />
          <label className="flex items-center gap-1 text-xs text-prime-muted">
            <input
              type="number"
              min={1}
              max={80}
              className={PRIME_INPUT_CLASS}
              value={form.passengers}
              onChange={(e) => setForm({ ...form, passengers: Number(e.target.value) || 1 })}
            />
            lugares
          </label>
          <select className={PRIME_INPUT_CLASS} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Category["kind"] })}>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <input
            className={`${PRIME_INPUT_CLASS} sm:col-span-3`}
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Descrição curta (aparece para o cliente)"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save({ name: form.name, passengers: form.passengers, kind: form.kind, description: form.description || null })}
          className="btn-primary disabled:opacity-50"
        >
          Salvar
        </button>
        <button type="button" disabled={busy} onClick={() => void save({ active: !c.active })} className="text-prime-muted hover:underline">
          {c.active ? "Desativar" : "Reativar"}
        </button>
        {msg ? <span className="text-xs text-prime-muted">{msg}</span> : null}
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
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Categorias de veículos</h2>
        <p className="text-sm text-prime-muted">
          Aparecem para o cliente na hora de pedir, com a foto e o número de lugares. Os preços de cada categoria ficam no cadastro de cada
          empresa.
        </p>
      </div>
      <ul className="grid gap-3 xl:grid-cols-2">
        {items.map((c) => (
          <CategoryCard key={c.id} c={c} onChanged={() => void load()} />
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-prime-bg p-3">
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
