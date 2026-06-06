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

/** Badges com fundo claro e texto escuro — legíveis em cards brancos do portal cliente. */
const portalClassMap: Record<TripOperationalStatus, string> = {
  requested: "border border-slate-300 bg-slate-100 text-slate-900",
  approved: "border border-blue-200 bg-blue-50 text-blue-950",
  dispatched: "border border-orange-200 bg-orange-50 text-orange-950",
  accepted: "border border-green-200 bg-green-50 text-green-950",
  on_the_way: "border border-green-200 bg-green-50 text-green-950",
  arrived: "border border-green-200 bg-green-50 text-green-950",
  in_progress: "border border-emerald-200 bg-emerald-50 text-emerald-950",
  completed: "border border-emerald-300 bg-emerald-100 text-emerald-950",
  cancelled: "border border-red-200 bg-red-50 text-red-950",
  rejected: "border border-red-300 bg-red-100 text-red-950",
  no_show: "border border-amber-200 bg-amber-50 text-amber-950",
  reassigned: "border border-purple-200 bg-purple-50 text-purple-950"
};

type Props = {
  status: TripOperationalStatus;
  variant?: "default" | "portal";
};

export function StatusBadge({ status, variant = "default" }: Props) {
  if (variant === "portal") {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${portalClassMap[status]}`}
      >
        {STATUS_CORRIDA_PT[status]}
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ background: colorMap[status] }}
    >
      {STATUS_CORRIDA_PT[status]}
    </span>
  );
}
