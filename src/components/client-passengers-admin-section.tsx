"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { ClientPassengerRow } from "@/lib/clients/client-passengers";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type Props = {
  clientId: string;
  disabled?: boolean;
};

type FormState = {
  name: string;
  phone: string;
  address: string;
  matricula: string;
  sector: string;
  postal_code: string;
};

const emptyForm = (): FormState => ({
  name: "",
  phone: "",
  address: "",
  matricula: "",
  sector: "",
  postal_code: ""
});

export function ClientPassengersAdminSection({ clientId, disabled }: Props) {
  const [rows, setRows] = useState<ClientPassengerRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession(`/api/clients/${clientId}/passengers`, {}, "admin");
    const json = (await res.json()) as { success?: boolean; data?: ClientPassengerRow[] };
    setRows(res.ok && json.success ? (json.data ?? []) : []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function lookupCep() {
    const cep = form.postal_code.replace(/\D/g, "");
    if (cep.length !== 8) {
      setMessage("Informe um CEP válido (8 dígitos).");
      return;
    }
    setCepBusy(true);
    const res = await fetchWithSupabaseSession(
      `/api/integrations/viacep-lookup?cep=${encodeURIComponent(cep)}`,
      {},
      "admin"
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      error?: { message?: string };
    };
    setCepBusy(false);
    if (!res.ok || !json.success || !json.data) {
      setMessage(json.error?.message ?? "CEP não encontrado.");
      return;
    }
    const d = json.data;
    const line = [d.logradouro, d.bairro, d.localidade && d.uf ? `${d.localidade}/${d.uf}` : d.localidade]
      .filter(Boolean)
      .join(", ");
    setForm((f) => ({ ...f, address: line }));
    setMessage(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/passengers`,
      {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          matricula: form.matricula.trim() || null,
          sector: form.sector.trim() || null
        })
      },
      "admin"
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (res.ok && json.success) {
      setForm(emptyForm());
      setMessage("Funcionário registado.");
      void load();
    } else {
      setMessage(json.error?.message ?? "Falha ao guardar.");
    }
  }

  async function deactivate(id: string) {
    setBusy(true);
    await fetchWithSupabaseSession(
      `/api/clients/${clientId}/passengers/${id}`,
      { method: "PATCH", body: JSON.stringify({ active: false }) },
      "admin"
    );
    setBusy(false);
    void load();
  }

  return (
    <section className="card space-y-4 md:col-span-2">
      <div>
        <h3 className="text-base font-semibold text-prime-text">Funcionários / Passageiros frequentes</h3>
        <p className="mt-1 text-sm text-prime-muted">
          Cadastro para autocomplete na criação de corridas (agenda e portal).
        </p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span>Nome completo *</span>
          <input
            required
            className={PRIME_INPUT_CLASS}
            disabled={disabled || busy}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Telefone</span>
          <input
            type="tel"
            className={PRIME_INPUT_CLASS}
            disabled={disabled || busy}
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Matrícula (opcional)</span>
          <input
            className={PRIME_INPUT_CLASS}
            disabled={disabled || busy}
            value={form.matricula}
            onChange={(e) => setForm((f) => ({ ...f, matricula: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Setor / centro de custo</span>
          <input
            className={PRIME_INPUT_CLASS}
            disabled={disabled || busy}
            value={form.sector}
            onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>CEP (ViaCEP)</span>
          <div className="flex gap-2">
            <input
              className={PRIME_INPUT_CLASS}
              placeholder="29055-260"
              disabled={disabled || busy}
              value={form.postal_code}
              onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
            />
            <button
              type="button"
              className="btn-outline shrink-0 text-sm"
              disabled={disabled || cepBusy}
              onClick={() => void lookupCep()}
            >
              {cepBusy ? "…" : "Buscar"}
            </button>
          </div>
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span>Endereço</span>
          <input
            className={PRIME_INPUT_CLASS}
            disabled={disabled || busy}
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={disabled || busy} className="btn-primary sm:col-span-2">
          {busy ? "A guardar…" : "Adicionar funcionário"}
        </button>
      </form>

      {message ? <p className="text-sm text-prime-muted">{message}</p> : null}

      {loading ? (
        <p className="text-sm text-prime-muted">A carregar…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-prime-muted">Nenhum funcionário cadastrado.</p>
      ) : (
        <ul className="divide-y divide-prime-border rounded-lg border border-prime-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-prime-text">{r.name}</span>
                {r.phone ? <span className="text-prime-muted"> · {r.phone}</span> : null}
                {r.sector ? <span className="block text-xs text-prime-muted">{r.sector}</span> : null}
                {r.address ? <span className="block text-xs text-prime-muted">{r.address}</span> : null}
              </span>
              <button
                type="button"
                className="text-xs text-red-700 hover:underline"
                disabled={disabled || busy}
                onClick={() => void deactivate(r.id)}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
