import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { CompanyPayablesPanel } from "@/components/company-payables-panel";
import { getSessionContext } from "@/lib/server/session";

export default async function ContasAPagarPage() {
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
        title="Contas a pagar"
        subtitle="Tudo que a empresa precisa pagar: seguro, combustível, aluguel, impostos, salários. O painel avisa no topo o que está vencendo."
      />
      <CompanyPayablesPanel />
    </div>
  );
}
