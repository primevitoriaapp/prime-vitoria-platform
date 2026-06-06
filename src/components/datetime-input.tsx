"use client";

import { useEffect, useId, useState } from "react";
import {
  isoToBrDateTimeInput,
  maskBrDateTimeInput,
  parseBrDateTimeToIso,
  resolveScheduledAtForSubmit
} from "@/lib/dates/br-date";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type Props = {
  value: string | null | undefined;
  onChange: (isoDateTime: string | null) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
};

const defaultClass = PRIME_INPUT_CLASS;

export function DateTimeInput({
  value,
  onChange,
  className = defaultClass,
  disabled,
  required,
  id: idProp
}: Props) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [text, setText] = useState(() => isoToBrDateTimeInput(value));

  useEffect(() => {
    setText(isoToBrDateTimeInput(value));
  }, [value]);

  function commitParsed(nextText: string, fallbackIso?: string | null) {
    const masked = maskBrDateTimeInput(nextText);
    setText(masked);
    if (!masked.trim()) {
      onChange(null);
      return;
    }
    const iso = resolveScheduledAtForSubmit(masked, fallbackIso);
    if (iso) onChange(iso);
  }

  function commit(next: string) {
    const masked = maskBrDateTimeInput(next);
    setText(masked);
    if (!masked.trim()) {
      onChange(null);
      return;
    }
    if (masked.length === 16) {
      const iso = parseBrDateTimeToIso(masked);
      if (iso) onChange(iso);
    }
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="DD/MM/AAAA HH:mm"
      className={className}
      disabled={disabled}
      required={required}
      value={text}
      onChange={(e) => commit(e.target.value)}
      onBlur={() => {
        if (!text.trim()) {
          onChange(null);
          return;
        }
        const iso = resolveScheduledAtForSubmit(text, value);
        if (iso) {
          setText(isoToBrDateTimeInput(iso));
          onChange(iso);
          return;
        }
        setText(isoToBrDateTimeInput(value));
      }}
    />
  );
}

/** Valor ISO pronto para POST /api/trips a partir do texto visível no campo. */
export function scheduledAtIsoFromDateTimeInput(
  text: string,
  fallbackIso?: string | null
): string | null {
  return resolveScheduledAtForSubmit(text, fallbackIso);
}
