"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Review = { review_required: boolean; review_reason: string | null; reviewed_at: string | null };

/** Aviso no detalhe da corrida: o motorista não confirmou o local pelo GPS. */
export function TripReviewBanner({ tripId }: { tripId: string }) {
  const [r, setR] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/review`, {}, "admin");
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Review };
      setR(j.success && j.data ? j.data : null);
    })();
  }, [tripId]);
  if (!r || (!r.review_required && !r.review_reason)) return null;
  if (!r.review_required) {
    return (
      <p className="rounded-2xl border border-prime-border bg-white px-4 py-3 text-sm text-prime-muted">
        ✓ Revisada pela central{r.reviewed_at ? ` em ${new Date(r.reviewed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}` : ""} · {r.review_reason}
      </p>
    );
  }
  async function markReviewed() {
    setBusy(true);
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/review`, { method: "POST" }, "admin");
    setBusy(false);
    if (res.ok) setR((prev) => (prev ? { ...prev, review_required: false, reviewed_at: new Date().toISOString() } : prev));
  }
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">⚠️ Corrida para revisar — local não confirmado pelo GPS</p>
      <p className="mt-1 text-sm text-amber-900/80">{r.review_reason}</p>
      <p className="mt-1 text-xs text-amber-900/70">Confira o trajeto, o KM e fale com o motorista antes de faturar.</p>
      <button type="button" disabled={busy} onClick={() => void markReviewed()} className="mt-3 rounded-xl bg-[#111] px-4 py-2 text-sm font-semibold text-prime-gold disabled:opacity-60">
        {busy ? "Salvando…" : "Marcar como revisada"}
      </button>
    </section>
  );
}

/** Alerta no início: quantas corridas a central precisa revisar. */
export function TripsToReviewAlert() {
  const [items, setItems] = useState<{ id: string; scheduled_at: string; origin_text: string | null; review_reason: string | null }[]>([]);
  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/trips/review-pending", {}, "admin");
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { items: typeof items } };
      if (j.success && j.data) setItems(j.data.items);
    })();
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        ⚠️ {items.length} corrida{items.length === 1 ? "" : "s"} para revisar (local não confirmado pelo GPS)
      </p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.slice(0, 5).map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-amber-900/80">
              {new Date(t.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {String(t.origin_text ?? "").split(",")[0]}
            </span>
            <Link href={`/agenda?trip=${t.id}#trip-detail` as Route} className="shrink-0 rounded-lg bg-white px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-300">
              Revisar
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
