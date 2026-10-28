"use client";

import { useState } from "react";

type Props = { size?: number; className?: string };

/** Logo cadastrada da Prime; se não houver, mostra o selo dourado. */
export function PrimeLogoMark({ size = 44, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-prime-gold to-prime-gold-hover text-prime-text ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        aria-hidden
      >
        ♛
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/api/public/brand-logo"
      alt="Prime Vitória"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-xl object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
