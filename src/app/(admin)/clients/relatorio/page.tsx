import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin-page-header";
import { ClientReportPanel } from "@/components/client-report-panel";

export default function ClientReportPage() {
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Relatório por cliente"
        subtitle="Todas as corridas do cliente no mês, para conferir e fechar. Valores errados podem ser corrigidos na própria linha."
      />
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-prime-border bg-white" />}>
        <ClientReportPanel />
      </Suspense>
    </div>
  );
}
