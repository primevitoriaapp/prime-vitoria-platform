"use client";

import { useEffect, useId, useState } from "react";
import {
  isoToBrDateInput,
  maskBrDateInput,
  parseBrDateToIso
} from "@/lib/dates/br-date";

type Props = {
  value: string | null | undefined;
  onChange: (isoDate: string | null) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
};

const defaultClass = "rounded border border-slate-300 px-2 py-2 w-full text-sm";

export function DateInput({
  value,
  onChange,
  className = defaultClass,
  disabled,
  required,
  id: idProp,
  "aria-invalid": ariaInvalid
}: Props) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [text, setText] = useState(() => isoToBrDateInput(value));

  useEffect(() => {
    setText(isoToBrDateInput(value));
  }, [value]);

  function commit(next: string) {
    const masked = maskBrDateInput(next);
    setText(masked);
    if (!masked.trim()) {
      onChange(null);
      return;
    }
    if (masked.length === 10) {
      const iso = parseBrDateToIso(masked);
      if (iso) onChange(iso);
    }
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="DD/MM/AAAA"
      className={className}
      disabled={disabled}
      required={required}
      aria-invalid={ariaInvalid}
      value={text}
      onChange={(e) => commit(e.target.value)}
      onBlur={() => {
        if (!text.trim()) {
          onChange(null);
          return;
        }
        const iso = parseBrDateToIso(text);
        if (iso) {
          setText(isoToBrDateInput(iso));
          onChange(iso);
        }
      }}
    />
  );
}
