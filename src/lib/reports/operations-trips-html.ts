type TripReportRow = {
  id: string;
  scheduled_at: string;
  operational_status: string;
  client_id: string;
  driver_id: string | null;
  origin_text: string;
  destination_text: string;
  passenger_name: string | null;
  planned_km: number | null;
  actual_km: number | null;
  dispatch_mode: string;
};

/** HTML simples para impressão / “Guardar como PDF” no browser. */
export function operationsTripsReportHtml(items: TripReportRow[], generatedAt: Date): string {
  const rows = items
    .map(
      (t) => `<tr>
<td>${escapeHtml(t.scheduled_at)}</td>
<td>${escapeHtml(t.operational_status)}</td>
<td class="mono">${escapeHtml(t.id)}</td>
<td>${escapeHtml(t.origin_text)}</td>
<td>${escapeHtml(t.destination_text)}</td>
<td>${escapeHtml(t.passenger_name ?? "")}</td>
<td>${formatReportKm(t.planned_km)}</td>
<td>${formatReportKm(t.actual_km)}</td>
<td>${escapeHtml(t.dispatch_mode)}</td>
</tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Relatório operacional — viagens</title>
<style>
  body { font-family: system-ui, sans-serif; font-size: 12px; margin: 24px; color: #0f172a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #64748b; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; }
  .mono { font-family: ui-monospace, monospace; font-size: 10px; }
  @media print { body { margin: 12px; } }
</style>
</head>
<body>
<h1>Relatório operacional — viagens</h1>
<p class="meta">Gerado em ${escapeHtml(generatedAt.toLocaleString("pt-BR"))} · ${items.length} registo(s)</p>
<table>
<thead>
<tr>
<th>Agendamento</th><th>Estado</th><th>ID</th><th>Origem</th><th>Destino</th><th>Passageiro</th><th>KM plan.</th><th>KM real</th><th>Despacho</th>
</tr>
</thead>
<tbody>
${rows || "<tr><td colspan=\"9\">Sem registos no período.</td></tr>"}
</tbody>
</table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatReportKm(value: number | null): string {
  if (value == null) return "";
  const km = Number(value);
  return Number.isFinite(km) ? km.toFixed(1) : "";
}
