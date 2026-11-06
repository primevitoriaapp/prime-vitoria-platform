import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { AccountingPackagePanel } from "@/components/accounting-package-panel";
import { getSessionContext } from "@/lib/server/session";

export default async function ContabilidadePage() {
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
      <AdminPageHeader title="Contabilidade" subtitle="Tudo que entrou e saiu no mês, com notas, boletos, comprovantes e extratos, num único arquivo para o contador." />
      <AccountingPackagePanel />
    </div>
  );
}
