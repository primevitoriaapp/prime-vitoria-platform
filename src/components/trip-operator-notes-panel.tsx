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
        setError(json?.error?.message ?? "Não foi possível salvar.");
        return;
      }
      setBody("");
      await load();
      onPosted?.();
    } catch {
      setError("Falha de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
      <h2 className="text-[17px] font-semibold tracking-tight text-prime-text">Notas da equipe</h2>
      <p className="mt-0.5 text-sm text-prime-muted">Só a equipe da Prime vê. Use para avisar quem pega o próximo turno.</p>
      {loading ? <p className="mt-3 text-sm text-prime-muted">Carregando…</p> : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {!loading && canUse ? (
        <>
          <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto text-sm">
            {items.length === 0 ? (
              <li className="text-prime-muted">Nenhuma nota ainda.</li>
            ) : (
              items.map((n) => (
                <li key={n.id} className="rounded-xl bg-prime-bg px-4 py-3">
                  <p className="whitespace-pre-wrap text-prime-text">{n.body}</p>
                  <p className="mt-1 text-xs text-prime-muted">
                    {new Date(n.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </li>
              ))
            )}
          </ul>
          <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-2">
            <label className="block text-sm">
              <span className="font-medium text-prime-text">Nova nota</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={4000}
                className="prime-input mt-1"
                placeholder="Ex.: passageiro pediu para esperar na porta 2"
              />
            </label>
            <button
              type="submit"
              disabled={saving || !body.trim()}
              className="btn-primary"
            >
              {saving ? "Salvando…" : "Adicionar nota"}
            </button>
          </form>
        </>
      ) : null}
    </section>
  );
}
