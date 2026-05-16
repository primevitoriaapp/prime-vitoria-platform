export type DriverPayableForecastInput = {
  due_date: string;
  status: string;
};

export function driverPayableDueDate(reference = new Date()): string {
  const due = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  due.setUTCDate(due.getUTCDate() + 30);
  return due.toISOString().slice(0, 10);
}

export function daysUntilDriverPayableDue(dueDate: string, reference = new Date()): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const base = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate());
  if (!Number.isFinite(due)) return 0;
  return Math.ceil((due - base) / 86_400_000);
}

export function driverPayableForecast(row: DriverPayableForecastInput, reference = new Date()) {
  const daysUntilDue = daysUntilDriverPayableDue(row.due_date, reference);
  return {
    days_until_due: daysUntilDue,
    overdue: row.status === "open" && daysUntilDue < 0,
    due_label:
      row.status === "paid"
        ? "Pago"
        : daysUntilDue < 0
          ? `Atrasado ${Math.abs(daysUntilDue)} dia(s)`
          : daysUntilDue === 0
            ? "Vence hoje"
            : `Previsto em D+${daysUntilDue}`
  };
}
