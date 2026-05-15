"use client";

import { useCallback, useEffect, useState } from "react";

type NoteRow = {
  id: number;
  author_profile_id: string;
  body: string;
  created_at: string;
};

type Props = {
  tripId: string;
  /** Chamado após nota criada com sucesso (ex.: refrescar histórico operacional). */
  onPosted?: () => void;
};

export function TripOperatorNotesPanel({ tripId, onPosted }: Props) {
  const [items, setItems] = useState<NoteRow[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canUse, setCanUse] = useState(true);

  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    fetch(`/api/trips/${tripId}/operator-notes`, { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.success) {
          setError(json?.error?.message ?? "Sem acesso às notas desta viagem.");
          setItems([]);
          setCanUse(false);
          return;
        }
        setCanUse(true);
        setItems((json.data ?? []) as NoteRow[]);
      })
      .catch(() => {
        setError("Falha de rede ao carregar notas.");
        setItems([]);
        setCanUse(false);
      })
      .finally(() => setLoading(false));
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/operator-notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text })
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? "Não foi possível guardar.");
        return;
      }
      setBody("");
      await load();
      onPosted?.();
    } catch {
      setError("Falha de rede ao guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Notas operacionais (equipa)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Reservado a administradores e operadores, com visão global de viagens. Continuidade entre turnos.
      </p>
      {loading ? <p className="mt-3 text-sm text-slate-600">A carregar…</p> : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {!loading && canUse ? (
        <>
          <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto text-sm">
            {items.length === 0 ? (
              <li className="text-slate-500">Ainda não há notas para esta viagem.</li>
            ) : (
              items.map((n) => (
                <li key={n.id} className="border-b border-slate-100 pb-2 last:border-0">
                  <p className="whitespace-pre-wrap text-slate-800">{n.body}</p>
                  <p className="mt-1 font-mono text-xs text-slate-400">
                    {new Date(n.created_at).toLocaleString("pt-BR")} · {n.author_profile_id.slice(0, 8)}…
                  </p>
                </li>
              ))
            )}
          </ul>
          <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-2">
            <label className="block text-sm text-slate-700">
              <span className="text-slate-500">Nova nota</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={4000}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-slate-900"
                placeholder="Contexto para o próximo operador…"
              />
            </label>
            <button
              type="submit"
              disabled={saving || !body.trim()}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {saving ? "A guardar…" : "Adicionar nota"}
            </button>
          </form>
        </>
      ) : null}
    </section>
  );
}
