import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { ArchivePanel } from "@/components/archive-panel";
import { getSessionContext } from "@/lib/server/session";

export default async function ArquivoPage() {
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
        title="Arquivo e backups"
        subtitle="Histórico da Omie, notas fiscais, extratos antigos e contratos guardados com segurança. Os extratos do mês vão em Conciliação bancária."
      />
      <ArchivePanel />
    </div>
  );
}
