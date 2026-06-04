type Props = {
  subtitle?: string;
  compact?: boolean;
  className?: string;
};

export function BrandLogo({ subtitle = "EXECUTIVE TRANSPORT", compact, className = "" }: Props) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span
        className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-prime-gold to-prime-gold-hover text-prime-bg shadow-sm shadow-black/40 ${
          compact ? "h-9 w-9 text-base" : "h-10 w-10 text-lg"
        }`}
        aria-hidden
      >
        ♛
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate font-semibold tracking-tight text-white">Prime Vitória</p>
        <p className="truncate text-[10px] font-medium uppercase tracking-[0.2em] text-prime-gold/80">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
