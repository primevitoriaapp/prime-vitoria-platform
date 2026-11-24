import { AdminPageHeader } from "@/components/admin-page-header";
import { PrimeClubAdmin } from "@/components/prime-club-admin";

export default function PrimeClubPage() {
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Prime Club"
        subtitle="Clube de benefícios dos motoristas: estabelecimentos parceiros, descontos, prospecção (Hunter) e usos registrados."
      />
      <PrimeClubAdmin />
    </div>
  );
}
