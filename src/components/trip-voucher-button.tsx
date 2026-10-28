"use client";

type Props = {
  tripId: string;
};

export function TripVoucherButton({ tripId }: Props) {
  return (
    <a
      href={`/voucher/${tripId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
    >
      Voucher (PDF)
    </a>
  );
}
