import { AdminPageHeader } from "@/components/admin-page-header";
import { QuotesPanel } from "@/components/quotes-panel";

export default function OrcamentosPage() {
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Orçamentos"
        subtitle="Monte o orçamento, mande em PDF e, quando o cliente aprovar, as corridas entram na Agenda sozinhas."
      />
      <QuotesPanel />
    </div>
  );
}
