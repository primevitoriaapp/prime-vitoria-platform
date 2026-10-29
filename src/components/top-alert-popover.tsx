"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type PopoverItem = { key: string; title: string; detail?: string; right?: string; href: string };

/** Pílula do topo que abre uma lista curta ao clicar (em vez de levar para uma página genérica). */
export function TopAlertPopover({
  label,
  className,
  title,
  items,
  footerHref,
  footerLabel
}: {
  label: ReactNode;
  className: string;
  title: string;
  items: PopoverItem[];
  footerHref: string;
  footerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" className={className} onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-32px))] rounded-2xl border border-prime-border bg-white p-2 text-sm shadow-xl">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-prime-muted">{title}</p>
          <ul className="max-h-80 overflow-y-auto">
            {items.map((it) => (
              <li key={it.key}>
                <Link
                  href={it.href as Route}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-prime-bg"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{it.title}</span>
                    {it.detail ? <span className="block truncate text-xs text-prime-muted">{it.detail}</span> : null}
                  </span>
                  {it.right ? <span className="shrink-0 font-semibold">{it.right}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={footerHref as Route}
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-lg px-2 py-2 text-center font-semibold text-prime-gold hover:bg-prime-bg"
          >
            {footerLabel} →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
