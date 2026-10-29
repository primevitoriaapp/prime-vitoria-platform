import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { BankReconciliationPanel } from "@/components/bank-reconciliation-panel";
import { getSessionContext } from "@/lib/server/session";

export default async function ConciliacaoPage() {
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
        title="Conciliação bancária"
        subtitle="Importe o extrato do banco e confirme com o que estava em aberto: faturas, corridas a receber, contas a pagar e repasses."
      />
      <BankReconciliationPanel />
    </div>
  );
}
