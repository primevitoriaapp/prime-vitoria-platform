type Props = {
  subtitle?: string;
  compact?: boolean;
  className?: string;
  /** Escuro = sidebar preta; claro = fundo marfim/branco */
  variant?: "dark" | "light";
};

export function BrandLogo({
  subtitle = "EXECUTIVE TRANSPORT",
  compact,
  className = "",
  variant = "light"
}: Props) {
  const onDark = variant === "dark";

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span
        className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-prime-gold to-prime-gold-hover text-prime-text shadow-sm ${
          compact ? "h-9 w-9 text-base" : "h-10 w-10 text-lg"
        }`}
        aria-hidden
      >
        ♛
      </span>
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
