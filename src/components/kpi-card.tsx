export function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <article className="card border-prime-input-border bg-gradient-to-br from-prime-card to-prime-bg shadow-prime-card">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-prime-muted">{label}</p>
      <p className="mt-2 font-prime-display text-2xl font-semibold text-prime-gold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-prime-muted">{hint}</p> : null}
    </article>
  );
}
