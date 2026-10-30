import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

/** Título das telas do painel: limpo e claro, dourado só no detalhe. */
export function AdminPageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="prime-page-hero mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="relative z-10">
        <h1 className="font-prime-display text-[26px] font-semibold leading-tight tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm text-[#8A8A8A]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="relative z-10 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
