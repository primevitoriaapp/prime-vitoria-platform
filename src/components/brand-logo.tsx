"use client";

import { useEffect, useState } from "react";

type Brand = { trade_name: string; tagline: string };
let brandCache: Brand | null = null;
let brandPromise: Promise<Brand | null> | null = null;

/** Nome e frase de "Minha empresa" (uma busca só por página). */
export function useBrand(): Brand {
  const [b, setB] = useState<Brand | null>(brandCache);
  useEffect(() => {
    if (brandCache) return;
    brandPromise ??= fetch("/api/public/brand")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Brand | null) => (brandCache = j))
      .catch(() => null);
    void brandPromise.then((j) => j && setB(j));
  }, []);
  return b ?? { trade_name: "Prime Vitória", tagline: "Transporte executivo" };
}

type Props = {
  subtitle?: string;
  compact?: boolean;
  className?: string;
  /** Escuro = sidebar preta; claro = fundo marfim/branco */
  variant?: "dark" | "light";
};

export function BrandLogo({
  subtitle,
  compact,
  className = "",
  variant = "light"
}: Props) {
  const onDark = variant === "dark";
  const brand = useBrand();

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/api/public/brand-logo"
        alt=""
        aria-hidden
        className={`shrink-0 rounded-lg bg-white object-contain p-0.5 shadow-sm ring-1 ring-prime-border ${compact ? "h-9 w-9" : "h-10 w-10"}`}
      />
      <div className="min-w-0 leading-tight">
        <p
          className={`truncate font-semibold tracking-tight ${
            onDark ? "text-white" : "text-prime-text"
          }`}
        >
          {brand.trade_name}
        </p>
        <p
          className={`truncate text-[11px] font-medium uppercase tracking-[0.2em] ${
            onDark ? "text-prime-gold/90" : "text-prime-gold"
          }`}
        >
          {subtitle ?? brand.tagline}
        </p>
      </div>
    </div>
  );
}
