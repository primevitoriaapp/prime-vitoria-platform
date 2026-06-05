type Props = {
  label?: "ida" | "volta" | null;
  className?: string;
};

export function TripLegLabelBadge({ label, className = "" }: Props) {
  if (!label) return null;
  const isIda = label === "ida";
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        isIda ? "bg-sky-600 text-white" : "bg-violet-600 text-white",
        className
      ].join(" ")}
    >
      {isIda ? "IDA" : "VOLTA"}
    </span>
  );
}
