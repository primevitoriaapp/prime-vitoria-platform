import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { PartnerPayoutsPanel } from "@/components/partner-payouts-panel";
import { getSessionContext } from "@/lib/server/session";

export default async function RepassesPage() {
  const session = await getSessionContext();
  if (session.role !== "admin" && session.role !== "financeiro") {
    return (
      <p className="py-16 text-center">
        Sem acesso ao financeiro.{" "}
        <Link href="/dashboard" className="text-prime-gold underline">
          Voltar
        </Link>
      </p>
    );
  }
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Repasses a parceiros"
        subtitle="Tudo que a Prime deve a cada empresa parceira ou motorista, em um só extrato. Pague de uma vez com um PIX e mande o extrato pelo WhatsApp."
      />
      <PartnerPayoutsPanel />
    </div>
  );
}
