import { AdminPageHeader } from "@/components/admin-page-header";
import { TripApprovalQueue } from "@/components/trip-approval-queue";

export const dynamic = "force-dynamic";

export default function ConferenciaPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <AdminPageHeader title="Aprovação de corridas" subtitle="Toda corrida finalizada passa por aqui: confira o KM e os valores e aprove." />
      <TripApprovalQueue />
    </div>
  );
}
