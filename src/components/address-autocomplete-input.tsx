"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

export type AddressPlaceSelection = {
  displayName: string;
  lat: number;
  lng: number;
};

type ApiHit = {
  place_id: number;
  display_name: string;
  lat: number;
  lng: number;
};

type Suggestion = AddressPlaceSelection & { place_id: number };

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: AddressPlaceSelection) => void;
  onCoordsClear?: () => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
  /** Indica que há coordenadas guardadas (seleção Nominatim). */
  hasCoords?: boolean;
  devFallbackRole?: "admin" | "operador" | "motorista" | "cliente";
};

const inputClass = PRIME_INPUT_CLASS;
const DEBOUNCE_MS = 500;
const MIN_CHARS = 3;

async function parseApiResponse(res: Response) {
  const text = await res.text();
  if (!text.trim()) return { success: false as const, data: [] as Suggestion[] };
  try {
    const parsed = JSON.parse(text) as {
      success?: boolean;
      data?: ApiHit[];
    };
    return { success: parsed.success === true, data: parsed.data ?? [] };
  } catch {
    return { success: false as const, data: [] as Suggestion[] };
  }
}

export function AddressAutocompleteInput({
  label,
  value,
  onChange,
  onPlaceSelect,
  onCoordsClear,
  required,
  className = "",
  placeholder,
  hasCoords,
  devFallbackRole = "admin"
}: Props) {
  const listId = useId();
  const inputId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const lastSelectedText = useRef<string | null>(null);

  const runSearch = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (q.length < MIN_CHARS) {
        setSuggestions([]);
        setOpen(false);
        setHint(null);
        return;
      }
      setBusy(true);
      setHint(null);
      try {
        const res = await fetchWithSupabaseSession(
          `/api/integrations/address-search?q=${encodeURIComponent(q)}`,
          {},
          devFallbackRole
        );
        const json = await parseApiResponse(res);
        if (res.ok && json.success && json.data.length > 0) {
          setSuggestions(
            json.data.map((d) => ({
              place_id: d.place_id,
              displayName: d.display_name,
              lat: Number(d.lat),
              lng: Number(d.lng)
            }))
          );
          setOpen(true);
          setActiveIndex(-1);
        } else {
          setSuggestions([]);
          setOpen(false);
          setHint("Nenhuma sugestão — pode usar texto livre.");
        }
      } catch {
        setSuggestions([]);
        setOpen(false);
        setHint("Busca indisponível — continue com texto livre.");
      } finally {
        setBusy(false);
      }
    },
    [devFallbackRole]
  );

  useEffect(() => {
    if (value === lastSelectedText.current) return;
    const timer = window.setTimeout(() => {
      if (value.trim().length >= MIN_CHARS && value !== lastSelectedText.current) {
        void runSearch(value);
      } else if (value.trim().length < MIN_CHARS) {
        setSuggestions([]);
        setOpen(false);
        setHint(null);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value, runSearch]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function selectSuggestion(s: Suggestion) {
    lastSelectedText.current = s.displayName;
    onChange(s.displayName);
    onPlaceSelect?.({ displayName: s.displayName, lat: s.lat, lng: s.lng });
    setSuggestions([]);
    setOpen(false);
    setHint(null);
    setActiveIndex(-1);
  }

  function handleInputChange(next: string) {
    if (lastSelectedText.current !== null && next !== lastSelectedText.current) {
      lastSelectedText.current = null;
      onCoordsClear?.();
    }
    onChange(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className={`relative grid gap-1 text-sm ${className}`}>
      <label htmlFor={inputId} className="font-medium text-prime-text">
        {label}
      </label>
      <input
        id={inputId}
        required={required}
        className={inputClass}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {busy ? <p className="text-xs text-slate-500">A buscar endereços…</p> : null}
      {hasCoords ? (
        <p className="text-xs text-emerald-800">Localização GPS guardada para esta paragem.</p>
      ) : null}
      {hint && !busy ? <p className="text-xs text-amber-900">{hint}</p> : null}
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((s, idx) => (
            <li key={s.place_id} role="option" aria-selected={idx === activeIndex}>
              <button
                type="button"
                className={`w-full px-3 py-2 text-left text-sm hover:bg-amber-50 ${
                  idx === activeIndex ? "bg-amber-50" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
              >
                {s.displayName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-slate-500">OpenStreetMap — digite 3+ caracteres e seleccione uma sugestão (Brasil).</p>
    </div>
  );
}
