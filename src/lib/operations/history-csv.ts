import { csvCell } from "../reports/csv.ts";

export function csvEscape(value: string | number | null | undefined): string {
  return csvCell(value);
}

export type HistoryCsvRow = {
  id: string;
  scheduled_at: string;
  operational_status: string;
  client_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  passenger_name: string | null;
  origin_text: string;
  destination_text: string;
  planned_km: number | null;
  actual_km: number | null;
  updated_at: string | null;
};

const HEADER = [
  "id",
  "scheduled_at",
  "operational_status",
  "client_id",
  "driver_id",
  "driver_name",
  "passenger_name",
  "origin_text",
  "destination_text",
  "planned_km",
  "actual_km",
  "updated_at"
];

export function buildOperationsHistoryCsv(rows: HistoryCsvRow[]): string {
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.scheduled_at),
        csvEscape(r.operational_status),
        csvEscape(r.client_id),
        csvEscape(r.driver_id),
        csvEscape(r.driver_name),
        csvEscape(r.passenger_name),
        csvEscape(r.origin_text),
        csvEscape(r.destination_text),
        csvEscape(r.planned_km),
        csvEscape(r.actual_km),
        csvEscape(r.updated_at)
      ].join(",")
    );
  }
  return lines.join("\n") + "\n";
}
