"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";

type Props = {
  /** Destino se não houver histórico no browser (ex.: lista principal). */
  fallbackHref: string;
  label?: string;
  className?: string;
  /** Acção customizada (ex.: fechar painel inline) em vez de navegar. */
  onClick?: () => void;
};

/** Botão «← Voltar» — usa histórico do browser ou fallback explícito. */
export function BackButton({ fallbackHref, label = "← Voltar", className = "", onClick }: Props) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (onClick) {
          onClick();
          return;
        }
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref as Route);
      }}
      className={
        className ||
        "inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
      }
    >
      {label}
    </button>
  );
}
