import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { FinanceDashboardPanel } from "@/components/finance-dashboard-panel";
import { OtherIncomesPanel } from "@/components/other-incomes-panel";
import { getSessionContext } from "@/lib/server/session";

export default async function PainelFinanceiroPage() {
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
        title="Painel financeiro"
        subtitle="Resultado (DRE), caixa, previsão dos próximos 90 dias, inadimplência e margem por cliente. Respeita a empresa escolhida no topo."
      />
      <FinanceDashboardPanel />
      <div className="mt-5 print:hidden">
        <OtherIncomesPanel />
      </div>
    </div>
  );
}
