"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";

type RosterItem = { id: string; name: string; address: string | null };
type Stop = { passenger_id: string | null; passenger_name: string; address_text: string; lat: number | null; lng: number | null };
type Loaded = { required: boolean; roster: RosterItem[]; stops: (Stop & { dropped_at?: string | null })[]; default_destination: string | null };

/**
 * Embarque com lista de passageiros (empresas que exigem, ex.: Comexport): o motorista marca quem veio,
 * confere o endereço de cada um e a ordem das paradas. Chama onDone quando salvou (ou quando a empresa não exige).
 */
export function DriverPassengerListStep({
  tripId,
  devFallbackRole,
  onDone
}: {
  tripId: string;
  devFallbackRole: "motorista" | "admin";
  onDone: (savedCount: number) => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [picked, setPicked] = useState<Stop[]>([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddr, setNewAddr] = useState<{ text: string; lat: number | null; lng: number | null }>({ text: "", lat: null, lng: null });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    void (async () => {
      const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/passenger-list`, {}, devFallbackRole);
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Loaded };
      if (off) return;
      if (!res.ok || !j.data) {
        setErr("Não consegui carregar a lista. Verifique a internet.");
        return;
      }
      if (!j.data.required) {
        onDone(0);
        return;
      }
      setData(j.data);
      setPicked(j.data.stops.map((s) => ({ passenger_id: s.passenger_id ?? null, passenger_name: s.passenger_name, address_text: s.address_text, lat: s.lat ?? null, lng: s.lng ?? null })));
    })();
    return () => {
      off = true;
    };
  }, [tripId, devFallbackRole, onDone]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = data?.roster ?? [];
    return t ? list.filter((p) => p.name.toLowerCase().includes(t)) : list;
  }, [data, q]);

  if (!data) {
    return <p className="mt-4 text-sm text-[#AAAAAA]">{err ?? "Carregando a lista de passageiros…"}</p>;
  }

  // O destino final da corrida fica sempre por último: quem é marcado entra antes dele.
  const norm = (t: string | null | undefined) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
  const insertBeforeFinal = (cur: Stop[], item: Stop) => {
    const dest = norm(data.default_destination);
    const idx = dest ? cur.findIndex((s) => norm(s.address_text) === dest) : -1;
    if (idx < 0) return [...cur, item];
    return [...cur.slice(0, idx), item, ...cur.slice(idx)];
  };
  const isPicked = (p: RosterItem) => picked.some((s) => s.passenger_id === p.id);
  const toggle = (p: RosterItem) =>
    setPicked((cur) =>
      isPicked(p)
        ? cur.filter((s) => s.passenger_id !== p.id)
        : insertBeforeFinal(cur, { passenger_id: p.id, passenger_name: p.name, address_text: p.address ?? "", lat: null, lng: null })
    );
  const move = (i: number, dir: -1 | 1) =>
    setPicked((cur) => {
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const setAddr = (i: number, text: string) => setPicked((cur) => cur.map((s, k) => (k === i ? { ...s, address_text: text, lat: null, lng: null } : s)));

  const missingAddr = picked.some((s) => s.address_text.trim().length < 3);
  const canSave = picked.length > 0 && !missingAddr && !saving;

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/passenger-list`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passengers: picked }) },
      devFallbackRole
    );
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setSaving(false);
    if (!res.ok || !j.success) {
      setErr(j.error?.message ?? "Não foi possível salvar. Tente de novo.");
      return;
    }
    onDone(picked.length);
  }

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold">Quem embarcou?</p>
      <p className="mt-0.5 text-xs text-[#AAAAAA]">Marque cada passageiro. O app monta uma parada de desembarque para cada um.</p>

      {data.roster.length > 6 ? (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar pelo nome"
          className="mt-3 w-full rounded-xl border border-[#3A3A3E] bg-[#111] px-3 py-2.5 text-sm text-[#fff] outline-none focus:border-[#C9A84C]"
        />
      ) : null}

      {data.roster.length === 0 ? (
        <p className="mt-3 rounded-xl bg-[#2A2A2E] px-3 py-2 text-xs text-[#CCCCCC]">
          A empresa ainda não tem funcionários cadastrados. Adicione os passageiros abaixo.
        </p>
      ) : (
        <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggle(p)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left ${isPicked(p) ? "border-[#C9A84C] bg-[#C9A84C]/15" : "border-[#3A3A3E] bg-[#111]"}`}
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${isPicked(p) ? "border-[#C9A84C] bg-[#C9A84C] text-[#111]" : "border-[#666]"}`}>
                  {isPicked(p) ? "✓" : ""}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-[#AAAAAA]">{p.address ?? "sem endereço cadastrado"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 space-y-2 rounded-xl border border-[#3A3A3E] p-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do passageiro"
            className="w-full rounded-xl border border-[#3A3A3E] bg-[#111] px-3 py-2.5 text-sm text-[#fff] outline-none focus:border-[#C9A84C]"
          />
          <div className="rounded-xl bg-white p-2 text-[#111]">
            <AddressAutocompleteInput
              label="Onde desce"
              value={newAddr.text}
              onChange={(text) => setNewAddr({ text, lat: null, lng: null })}
              onPlaceSelect={(pl) => setNewAddr({ text: pl.displayName, lat: pl.lat, lng: pl.lng })}
              hasCoords={newAddr.lat != null}
              placeholder="Bairro, rua ou número"
              devFallbackRole={devFallbackRole}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={newName.trim().length < 2 || newAddr.text.trim().length < 3}
              onClick={() => {
                setPicked((cur) => insertBeforeFinal(cur, { passenger_id: null, passenger_name: newName.trim(), address_text: newAddr.text.trim(), lat: newAddr.lat, lng: newAddr.lng }));
                setNewName("");
                setNewAddr({ text: "", lat: null, lng: null });
                setAdding(false);
              }}
              className="flex-1 rounded-xl bg-[#C9A84C] py-2.5 text-sm font-bold text-[#111] disabled:opacity-40"
            >
              Adicionar
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-xl border border-[#3A3A3E] px-4 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 w-full rounded-xl border border-dashed border-[#666] py-2.5 text-sm">
          + Passageiro que não está na lista
        </button>
      )}

      {picked.length ? (
        <div className="mt-4">
          <p className="text-sm font-semibold">Ordem das paradas ({picked.length})</p>
          <ol className="mt-2 space-y-2">
            {picked.map((s, i) => (
              <li key={`${s.passenger_id ?? s.passenger_name}-${i}`} className="rounded-xl border border-[#3A3A3E] bg-[#111] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {i + 1}. {s.passenger_name}
                  </span>
                  <span className="flex gap-1">
                    <button type="button" aria-label="Subir" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg border border-[#3A3A3E] px-2.5 py-1 disabled:opacity-30">
                      ▲
                    </button>
                    <button type="button" aria-label="Descer" onClick={() => move(i, 1)} disabled={i === picked.length - 1} className="rounded-lg border border-[#3A3A3E] px-2.5 py-1 disabled:opacity-30">
                      ▼
                    </button>
                  </span>
                </div>
                <input
                  value={s.address_text}
                  onChange={(e) => setAddr(i, e.target.value)}
                  placeholder="Endereço onde desce"
                  className={`mt-2 w-full rounded-lg border bg-[#1F1F22] px-3 py-2 text-xs text-[#fff] outline-none focus:border-[#C9A84C] ${s.address_text.trim().length < 3 ? "border-red-400" : "border-[#3A3A3E]"}`}
                />
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {missingAddr ? <p className="mt-2 text-xs text-red-300">Falta o endereço de algum passageiro.</p> : null}
      {err ? <p className="mt-2 text-sm text-red-300">{err}</p> : null}
      <button type="button" onClick={() => void save()} disabled={!canSave} className="mt-4 w-full rounded-2xl bg-[#C9A84C] py-3.5 text-base font-bold text-[#111] disabled:opacity-40">
        {saving ? "Salvando…" : `Confirmar ${picked.length || ""} passageiro(s)`}
      </button>
    </div>
  );
}
