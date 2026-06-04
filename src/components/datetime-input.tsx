"use client";

import { useEffect, useId, useState } from "react";
import {
  isoToBrDateTimeInput,
  maskBrDateTimeInput,
  parseBrDateTimeToIso
} from "@/lib/dates/br-date";

type Props = {
  value: string | null | undefined;
  onChange: (isoDateTime: string | null) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
};

const defaultClass = "rounded border border-slate-300 px-2 py-2 w-full text-sm";

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
        const iso = parseBrDateTimeToIso(text);
        if (iso) {
          setText(isoToBrDateTimeInput(iso));
          onChange(iso);
        }
      }}
    />
  );
}
