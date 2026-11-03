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
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-prime-text sm:text-[30px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-3xl text-[15px] text-prime-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="relative z-10 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
