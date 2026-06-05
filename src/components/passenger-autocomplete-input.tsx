"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

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
    <label className={`grid gap-1 text-sm ${className}`}>
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
          placeholder={clientId ? "Digite para buscar funcionário…" : "Seleccione o cliente primeiro"}
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
        {open && loading ? (
          <p className="absolute z-20 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs text-prime-muted shadow">
            A buscar…
          </p>
        ) : null}
      </div>
    </label>
  );
}
