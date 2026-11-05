"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

/** Excluir corrida lançada por engano (duplicada, erro de digitação). Pede confirmação. */
export function TripDeleteButton({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}`, { method: "DELETE" }, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setError(json.error?.message ?? "Não foi possível excluir.");
      setConfirming(false);
      return;
    }
    router.push("/agenda" as Route);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-red-200 bg-white p-3">
      {!confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-prime-muted">Lançou duplicada ou por engano?</p>
          <button type="button" onClick={() => setConfirming(true)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50">
            Excluir corrida
          </button>
        </div>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-red-800">Excluir esta corrida de vez? Some da agenda, do financeiro e do app do motorista.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-[#fff] disabled:opacity-50">
              {busy ? "Excluindo…" : "Sim, excluir"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border">
              Não, voltar
            </button>
          </div>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
