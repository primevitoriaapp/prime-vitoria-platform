"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";

export type ClientPassengerOption = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  matricula: string | null;
  sector: string | null;
};

type Props = {
  clientId: string;
  label?: string;
  value: string;
  onChange: (name: string) => void;
  onSelect?: (passenger: ClientPassengerOption) => void;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  devFallbackRole?: "admin" | "operador" | "cliente";
};

export function PassengerAutocompleteInput({
  clientId,
  label = "Passageiro",
  value,
  onChange,
  onSelect,
  required,
  className = "",
  disabled,
  devFallbackRole = "admin"
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ClientPassengerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cadastro rápido: funcionário que ainda não existe na empresa.
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", sector: "" });
  const [saving, setSaving] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  async function saveNew() {
    if (form.name.trim().length < 2) return setAddErr("Digite o nome.");
    setSaving(true);
    setAddErr(null);
    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/passengers`,
      {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null, sector: form.sector.trim() || null, active: true })
      },
      devFallbackRole
    );
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: ClientPassengerOption; error?: { message?: string } };
    setSaving(false);
    if (!res.ok || !j.success || !j.data) return setAddErr(j.error?.message ?? "Não foi possível cadastrar.");
    setAdding(false);
    pick(j.data);
  }

  const fetchOptions = useCallback(
    async (q: string) => {
      if (!clientId) {
        setOptions([]);
        return;
      }
      setLoading(true);
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const res = await fetchWithSupabaseSession(
        `/api/clients/${clientId}/passengers${qs}`,
        {},
        devFallbackRole
      );
      const json = (await res.json()) as { success?: boolean; data?: ClientPassengerOption[] };
      setOptions(res.ok && json.success ? (json.data ?? []) : []);
      setLoading(false);
    },
    [clientId, devFallbackRole]
  );

  useEffect(() => {
    if (!clientId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchOptions(value), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [clientId, value, fetchOptions]);

  function pick(p: ClientPassengerOption) {
    onChange(p.name);
    onSelect?.(p);
    setOpen(false);
  }

  return (
    <div className={`grid gap-2 ${className}`}>
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <div className="relative">
        <input
          className={PRIME_INPUT_CLASS}
          required={required}
          disabled={disabled || !clientId}
          value={value}
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          placeholder={clientId ? "Digite para buscar funcionário…" : "Selecione o cliente primeiro"}
          onFocus={() => {
            setOpen(true);
            void fetchOptions(value);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
        />
        {open && options.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-prime-border bg-white py-1 shadow-lg"
          >
            {options.map((p) => (
              <li key={p.id} role="option">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                >
                  <span className="font-medium text-prime-text">{p.name}</span>
                  {p.phone ? <span className="text-prime-muted"> · {p.phone}</span> : null}
                  {p.sector ? (
                    <span className="mt-0.5 block text-xs text-prime-muted">{p.sector}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {open && !loading && !adding && clientId && value.trim().length >= 2 && options.length === 0 ? (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-prime-border bg-white p-3 text-sm shadow-lg">
            <p className="text-prime-muted">Nenhum funcionário com esse nome nesta empresa.</p>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setForm({ name: value.trim().replace(/\b\w/g, (c) => c.toUpperCase()), phone: "", address: "", sector: "" });
                setAddErr(null);
                setAdding(true);
                setOpen(false);
              }}
              className="mt-1 font-semibold text-prime-gold-ink underline"
            >
              + Cadastrar “{value.trim()}” como funcionário agora
            </button>
          </div>
        ) : null}
        {open && loading ? (
          <p className="absolute z-20 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs text-prime-muted shadow">
            A buscar…
          </p>
        ) : null}
      </div>
    </label>
    {adding ? (
      <div className="grid gap-3 rounded-xl border-2 border-prime-gold bg-[#FBF7EC] p-3">
        <p className="text-sm font-semibold">Novo funcionário da empresa</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span>Nome</span>
            <input className={PRIME_INPUT_CLASS} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>WhatsApp</span>
            <input className={PRIME_INPUT_CLASS} inputMode="tel" placeholder="(27) 99999-9999" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
        </div>
        <AddressAutocompleteInput
          label="Endereço de casa (para buscar e levar)"
          value={form.address}
          onChange={(v) => setForm((f) => ({ ...f, address: v }))}
          placeholder="Rua, número, bairro, cidade"
          devFallbackRole={devFallbackRole === "cliente" ? "cliente" : "admin"}
        />
        <label className="grid gap-1 text-sm">
          <span>Setor / turno (opcional)</span>
          <input className={PRIME_INPUT_CLASS} placeholder="Ex.: Logística, turno da noite" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
        </label>
        {addErr ? <p className="text-sm text-red-700">{addErr}</p> : null}
        <div className="flex gap-2">
          <button type="button" disabled={saving} onClick={() => void saveNew()} className="rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-[#C9A84C] disabled:opacity-50">
            {saving ? "Salvando…" : "Salvar e usar nesta corrida"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border">
            Cancelar
          </button>
        </div>
        <p className="text-xs text-prime-muted">Fica salvo na ficha da empresa: na próxima corrida é só digitar o nome.</p>
      </div>
    ) : null}
    </div>
  );
}
