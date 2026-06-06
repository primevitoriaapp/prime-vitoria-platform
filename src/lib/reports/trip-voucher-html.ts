import { formatBrDateTime } from "@/lib/dates/br-date";
import type { TenantCompanyProfile } from "@/lib/company/tenant-company-profile";

export type TripVoucherData = {
  tripId: string;
  clientName: string;
  passengerName: string;
  originText: string;
  destinationText: string;
  scheduledAt: string;
  driverName: string | null;
  vehicleLabel: string | null;
  clientAmount: number | null;
  serviceLabel: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** HTML imprimível — «Guardar como PDF» no browser. */
export function tripVoucherHtml(company: TenantCompanyProfile, trip: TripVoucherData): string {
  const when = formatBrDateTime(trip.scheduledAt) || trip.scheduledAt;
  const logoBlock = company.logo_storage_path
    ? `<img src="/api/tenant/company-profile/logo" alt="" style="max-height:56px;margin-bottom:8px"/>`
    : `<p style="font-size:22px;font-weight:700;color:#b45309;margin:0">${escapeHtml(company.trade_name)}</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Voucher ${escapeHtml(trip.tripId.slice(0, 8))}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #111; max-width: 720px; margin: 24px auto; padding: 0 16px; }
  .header { border-bottom: 2px solid #b45309; padding-bottom: 12px; margin-bottom: 20px; }
  .muted { color: #555; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { width: 32%; color: #6b7280; font-weight: 600; font-size: 12px; text-transform: uppercase; }
  .amount { font-size: 20px; font-weight: 700; color: #b45309; }
  @media print { body { margin: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px">
    <button onclick="window.print()" style="padding:8px 16px;cursor:pointer">Imprimir / Guardar PDF</button>
  </div>
  <header class="header">
    ${logoBlock}
    <p class="muted" style="margin:4px 0 0">${escapeHtml(company.legal_name)}</p>
    <p class="muted" style="margin:2px 0 0">CNPJ ${escapeHtml(company.cnpj)}</p>
    <p class="muted" style="margin:2px 0 0">${escapeHtml(company.address_line)}</p>
    ${company.phone ? `<p class="muted">${escapeHtml(company.phone)}</p>` : ""}
    ${company.email ? `<p class="muted">${escapeHtml(company.email)}</p>` : ""}
  </header>
  <h1 style="font-size:18px;margin:0 0 4px">Voucher de corrida</h1>
  <p class="muted">Ref. ${escapeHtml(trip.tripId)}</p>
  <table>
    <tr><th>Cliente</th><td>${escapeHtml(trip.clientName)}</td></tr>
    <tr><th>Passageiro</th><td>${escapeHtml(trip.passengerName)}</td></tr>
    ${trip.serviceLabel ? `<tr><th>Serviço</th><td>${escapeHtml(trip.serviceLabel)}</td></tr>` : ""}
    <tr><th>Data e horário</th><td>${escapeHtml(when)}</td></tr>
    <tr><th>Origem</th><td>${escapeHtml(trip.originText)}</td></tr>
    <tr><th>Destino</th><td>${escapeHtml(trip.destinationText)}</td></tr>
    <tr><th>Motorista</th><td>${escapeHtml(trip.driverName ?? "A definir")}</td></tr>
    <tr><th>Veículo</th><td>${escapeHtml(trip.vehicleLabel ?? "A definir")}</td></tr>
    <tr><th>Valor</th><td class="amount">${escapeHtml(fmtMoney(trip.clientAmount))}</td></tr>
  </table>
  <p class="muted" style="margin-top:24px">Documento gerado em ${escapeHtml(formatBrDateTime(new Date().toISOString()) || "")}</p>
</body>
</html>`;
}
