"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
};

const inputClass = "rounded border border-slate-300 px-2 py-2 w-full text-sm";

export function PlacesAutocompleteInput({
  label,
  value,
  onChange,
  required,
  className = "",
  placeholder
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const [scriptReady, setScriptReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;

    if (typeof window !== "undefined" && window.google?.maps?.places?.Autocomplete) {
      setScriptReady(true);
      return;
    }

    const existing = document.getElementById("google-maps-places-script");
    if (existing) {
      const timer = window.setInterval(() => {
        if (window.google?.maps?.places?.Autocomplete) {
          setScriptReady(true);
          window.clearInterval(timer);
        }
      }, 200);
      return () => window.clearInterval(timer);
    }

    const script = document.createElement("script");
    script.id = "google-maps-places-script";
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    script.onload = () => setScriptReady(true);
    script.onerror = () => setLoadError("Não foi possível carregar o script do Google Maps.");
    document.head.appendChild(script);
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !scriptReady || !inputRef.current || loadError) return;

    const Autocomplete = window.google!.maps.places.Autocomplete;
    const autocomplete = new Autocomplete(inputRef.current, {
      componentRestrictions: { country: "br" },
      fields: ["formatted_address", "geometry", "name"]
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const text = place.formatted_address ?? place.name ?? "";
      if (text) onChange(text);
    });

    return () => {
      window.google?.maps.event.removeListener(listener);
    };
  }, [apiKey, scriptReady, loadError, onChange]);

  return (
    <label className={`grid gap-1 text-sm ${className}`}>
      <span>{label}</span>
      <input
        ref={inputRef}
        id={inputId}
        required={required}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {!apiKey ? (
        <p className="text-xs text-amber-900" role="status">
          Autocomplete indisponível: configure a variável{" "}
          <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> no projeto Vercel
          (Preview e Production) e faça um novo deploy. Pode digitar o endereço manualmente.
        </p>
      ) : loadError ? (
        <p className="text-xs text-red-800" role="alert">
          {loadError} Digite o endereço manualmente.
        </p>
      ) : scriptReady ? (
        <p className="text-xs text-slate-500">Comece a digitar e seleccione uma sugestão do Google Maps.</p>
      ) : (
        <p className="text-xs text-slate-500">A carregar autocomplete…</p>
      )}
    </label>
  );
}
