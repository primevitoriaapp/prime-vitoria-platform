"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type RosterItem = { id: string; name: string };
type Boarded = { passenger_id: string | null; passenger_name: string };
type Loaded = { required: boolean; roster: RosterItem[]; boarded: Boarded[] };

/**
 * Empresas que exigem lista (ex.: Comexport): no embarque o motorista só marca quem embarcou.
 * A rota (embarque, paradas e destino) continua a que foi cadastrada pela central.
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
  const [picked, setPicked] = useState<Boarded[]>([]);
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
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
      setPicked(j.data.boarded ?? []);
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

  const isPicked = (p: RosterItem) => picked.some((s) => s.passenger_id === p.id);
  const toggle = (p: RosterItem) =>
    setPicked((cur) => (isPicked(p) ? cur.filter((s) => s.passenger_id !== p.id) : [...cur, { passenger_id: p.id, passenger_name: p.name }]));
  const extras = picked.filter((s) => !s.passenger_id);

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
      <p className="mt-0.5 text-xs text-[#AAAAAA]">Marque cada passageiro que entrou no carro. A rota continua a que a central cadastrou.</p>

      {data.roster.length > 6 ? (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar pelo nome"
          className="mt-3 w-full rounded-xl border border-[#3A3A3E] bg-[#111] px-3 py-2.5 text-base text-[#fff] outline-none focus:border-[#C9A84C]"
        />
      ) : null}

      {data.roster.length === 0 ? (
        <p className="mt-3 rounded-xl bg-[#2A2A2E] px-3 py-2 text-xs text-[#CCCCCC]">A empresa ainda não tem funcionários cadastrados. Escreva o nome de quem embarcou abaixo.</p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggle(p)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${isPicked(p) ? "border-[#C9A84C] bg-[#C9A84C]/15" : "border-[#3A3A3E] bg-[#111]"}`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm font-bold ${isPicked(p) ? "border-[#C9A84C] bg-[#C9A84C] text-[#111]" : "border-[#666]"}`}>
                  {isPicked(p) ? "✓" : ""}
                </span>
                <span className="text-sm font-semibold">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {extras.length ? (
        <ul className="mt-2 space-y-1.5">
          {extras.map((s, i) => (
            <li key={`${s.passenger_name}-${i}`} className="flex items-center justify-between rounded-xl border border-[#C9A84C] bg-[#C9A84C]/15 px-3 py-2.5 text-sm font-semibold">
              ✓ {s.passenger_name}
              <button type="button" className="text-xs text-[#AAAAAA]" onClick={() => setPicked((cur) => cur.filter((x) => x !== s))}>
                Tirar
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Passageiro que não está na lista"
          className="min-w-0 flex-1 rounded-xl border border-[#3A3A3E] bg-[#111] px-3 py-2.5 text-base text-[#fff] outline-none focus:border-[#C9A84C]"
        />
        <button
          type="button"
          disabled={newName.trim().length < 2}
          onClick={() => {
            setPicked((cur) => [...cur, { passenger_id: null, passenger_name: newName.trim() }]);
            setNewName("");
          }}
          className="rounded-xl bg-[#C9A84C] px-4 text-sm font-bold text-[#111] disabled:opacity-40"
        >
          Adicionar
        </button>
      </div>

      {err ? <p className="mt-2 text-sm text-red-300">{err}</p> : null}
      <button type="button" onClick={() => void save()} disabled={!picked.length || saving} className="mt-4 w-full rounded-2xl bg-[#C9A84C] py-3.5 text-base font-bold text-[#111] disabled:opacity-40">
        {saving ? "Salvando…" : `Confirmar ${picked.length || ""} passageiro(s)`}
      </button>
    </div>
  );
}
