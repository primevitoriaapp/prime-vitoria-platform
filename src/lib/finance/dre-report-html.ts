import type { DreSummary } from "./dre-summary";

type DreExtras = {
  receivables?: {
    open_count: number;
    open_amount: number;
    paid_in_period_amount: number;
  };
  payables?: {
    open_count: number;
    open_amount: number;
    paid_in_period_amount: number;
  };
};

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function dreSummaryReportHtml(dre: DreSummary, extras: DreExtras, generatedAt: Date): string {
  const ar = extras.receivables;
  const ap = extras.payables;

  const arCards = ar
    ? `<div class="card"><div class="label">A receber (aberto)</div><div class="value">${ar.open_count} · ${fmt(ar.open_amount)}</div></div>
<div class="card"><div class="label">Recebido no período</div><div class="value">${fmt(ar.paid_in_period_amount)}</div></div>`
    : "";

  const apCards = ap
    ? `<div class="card"><div class="label">A pagar motoristas</div><div class="value">${ap.open_count} · ${fmt(ap.open_amount)}</div></div>
<div class="card"><div class="label">Pago no período</div><div class="value">${fmt(ap.paid_in_period_amount)}</div></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>DRE — ${escapeHtml(dre.period_start)} a ${escapeHtml(dre.period_end)}</title>
<style>
  body { font-family: system-ui, sans-serif; font-size: 13px; margin: 24px; color: #0f172a; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #64748b; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; max-width: 720px; }
  .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #f8fafc; }
  .label { font-size: 11px; text-transform: uppercase; color: #64748b; }
  .value { font-size: 18px; font-weight: 600; margin-top: 4px; }
  .highlight { color: #047857; }
  @media print { body { margin: 12px; } }
</style>
</head>
<body>
<h1>Demonstrativo de resultado (DRE)</h1>
<p class="meta">Período ${escapeHtml(dre.period_start)} — ${escapeHtml(dre.period_end)} · Gerado ${escapeHtml(generatedAt.toLocaleString("pt-BR"))}</p>
<div class="grid">
  <div class="card"><div class="label">Receita (clientes)</div><div class="value">${fmt(dre.revenue_clients)}</div></div>
  <div class="card"><div class="label">Custo operacional</div><div class="value">${fmt(dre.cost_clients)}</div></div>
  <div class="card"><div class="label">Margem líquida</div><div class="value highlight">${fmt(dre.net_margin)}</div></div>
  <div class="card"><div class="label">Repasse motoristas</div><div class="value">${fmt(dre.payout_drivers)}</div></div>
  <div class="card"><div class="label">Fechamentos</div><div class="value">${dre.closing_rows} linhas (${dre.closed_rows} fechadas)</div></div>
  ${arCards}
  ${apCards}
</div>
</body>
</html>`;
}
