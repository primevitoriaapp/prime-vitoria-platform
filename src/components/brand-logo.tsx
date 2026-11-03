type Props = {
  subtitle?: string;
  compact?: boolean;
  className?: string;
  /** Escuro = sidebar preta; claro = fundo marfim/branco */
  variant?: "dark" | "light";
};

export function BrandLogo({
  subtitle = "TRANSPORTE EXECUTIVO",
  compact,
  className = "",
  variant = "light"
}: Props) {
  const onDark = variant === "dark";

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
          Prime Vitória
        </p>
        <p
          className={`truncate text-[10px] font-medium uppercase tracking-[0.2em] ${
            onDark ? "text-prime-gold/90" : "text-prime-gold"
          }`}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
