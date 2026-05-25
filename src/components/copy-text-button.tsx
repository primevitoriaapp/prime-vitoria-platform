"use client";

import { useState } from "react";

type Props = {
  text: string;
  label?: string;
  className?: string;
};

/** Copia texto para clipboard (smoke / operação). */
export function CopyTextButton({ text, label = "Copiar", className = "" }: Props) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      setDone(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`rounded border px-2 py-0.5 text-xs font-medium hover:opacity-90 ${className}`}
    >
      {done ? "Copiado" : label}
    </button>
  );
}
