import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

/** Faixa de título das telas do painel: preta com brilho dourado. */
export function AdminPageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="prime-page-hero mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="relative z-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#c9a84c]">Prime Vitória</p>
        <h1 className="mt-1 font-prime-display text-2xl tracking-tight sm:text-3xl">{title}</h1>
        <span className="mt-2 block h-0.5 w-12 rounded-full bg-[#c9a84c]" aria-hidden />
        {subtitle ? <p className="mt-2 max-w-3xl text-sm text-[#cfc6b0]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="relative z-10 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
