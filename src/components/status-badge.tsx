import { TripOperationalStatus } from "@/lib/domain/types";

const colorMap: Record<TripOperationalStatus, string> = {
  requested: "#64748b",
  approved: "#2563eb",
  dispatched: "#7c3aed",
  accepted: "#0891b2",
  on_the_way: "#d97706",
  arrived: "#ea580c",
  in_progress: "#4f46e5",
  completed: "#16a34a",
  cancelled: "#b91c1c",
  rejected: "#991b1b",
  no_show: "#b45309",
  reassigned: "#9333ea"
};

export function StatusBadge({ status }: { status: TripOperationalStatus }) {
  return (
    <span className="badge" style={{ background: colorMap[status], color: "white" }}>
      {status}
    </span>
  );
}
