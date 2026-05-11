export function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="card">
      <small>{label}</small>
      <h3 style={{ margin: "6px 0 0" }}>{value}</h3>
    </article>
  );
}
