"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { CostCenterRow } from "@/lib/clients/client-cost-centers";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type Props = {
  clientId: string;
  disabled?: boolean;
};

type FormState = {
  name: string;
  code: string;
  responsible_name: string;
  responsible_email: string;
};

const emptyForm = (): FormState => ({
  name: "",
  code: "",
  responsible_name: "",
  responsible_email: ""
});

export function ClientCostCentersAdminSection({ clientId, disabled }: Props) {
  const [rows, setRows] = useState<CostCenterRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession(`/api/clients/${clientId}/cost-centers`, {}, "admin");
    const json = (await res.json()) as { success?: boolean; data?: CostCenterRow[] };
    setRows(res.ok && json.success ? (json.data ?? []) : []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/cost-centers`,
      {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim() || null,
          responsible_name: form.responsible_name.trim() || null,
          responsible_email: form.responsible_email.trim() || null
        })
      },
      "admin"
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (res.ok && json.success) {
      setForm(emptyForm());
      setMessage("Centro de custo registado.");
      void load();
    } else {
      setMessage(json.error?.message ?? "Falha ao guardar.");
    }
  }

  async function deactivate(id: string) {
    setBusy(true);
    await fetchWithSupabaseSession(
      `/api/clients/${clientId}/cost-centers/${id}`,
      { method: "PATCH", body: JSON.stringify({ active: false }) },
      "admin"
    );
    setBusy(false);
    void load();
  }

  return (
    <section className="card space-y-4 md:col-span-2">
      <div>
        <h3 className="text-base font-semibold text-prime-text">Centros de custo</h3>
        <p className="mt-1 text-sm text-prime-muted">
          Faturamento por centro; NF única para a empresa. Responsável vê só as corridas do seu centro no portal.
        </p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span>Nome do centro *</span>
          <input
            required
            className={PRIME_INPUT_CLASS}
            disabled={disabled || busy}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Código (opcional)</span>
          <input
            className={PRIME_INPUT_CLASS}
            disabled={disabled || busy}
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Responsável</span>
          <input
            className={PRIME_INPUT_CLASS}
            disabled={disabled || busy}
            value={form.responsible_name}
            onChange={(e) => setForm((f) => ({ ...f, responsible_name: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>E-mail do responsável</span>
          <input
            type="email"
            className={PRIME_INPUT_CLASS}
            disabled={disabled || busy}
            value={form.responsible_email}
            onChange={(e) => setForm((f) => ({ ...f, responsible_email: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={disabled || busy} className="btn-primary sm:col-span-2">
          {busy ? "A guardar…" : "Adicionar centro de custo"}
        </button>
      </form>

      {message ? <p className="text-sm text-prime-muted">{message}</p> : null}

      {loading ? (
        <p className="text-sm text-prime-muted">A carregar…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-prime-muted">Nenhum centro de custo cadastrado.</p>
      ) : (
        <ul className="divide-y divide-prime-border rounded-lg border border-prime-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-prime-text">
                  {r.code ? `${r.code} · ` : ""}
                  {r.name}
                </span>
                {r.responsible_name ? (
                  <span className="block text-xs text-prime-muted">{r.responsible_name}</span>
                ) : null}
                {r.responsible_email ? (
                  <span className="block text-xs text-prime-muted">{r.responsible_email}</span>
                ) : null}
              </span>
              {r.active ? (
                <button
                  type="button"
                  className="text-xs text-red-700 hover:underline"
                  disabled={disabled || busy}
                  onClick={() => void deactivate(r.id)}
                >
                  Desactivar
                </button>
              ) : (
                <span className="text-xs text-prime-muted">Inactivo</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
