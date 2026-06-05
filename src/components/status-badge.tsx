import { TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";

/** Cores operacionais da agenda (Solicitada=cinza, Despachada=laranja, etc.). */
const colorMap: Record<TripOperationalStatus, string> = {
  requested: "#64748b",
  approved: "#2563eb",
  dispatched: "#ea580c",
  accepted: "#16a34a",
  on_the_way: "#16a34a",
  arrived: "#16a34a",
  in_progress: "#16a34a",
  completed: "#14532d",
  cancelled: "#b91c1c",
  rejected: "#991b1b",
  no_show: "#b45309",
  reassigned: "#9333ea"
};

export function StatusBadge({ status }: { status: TripOperationalStatus }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ background: colorMap[status] }}
    >
      {STATUS_CORRIDA_PT[status]}
    </span>
  );
}
